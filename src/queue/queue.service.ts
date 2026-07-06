import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { EtaService } from '../eta/eta.service';
import { CheckInDto, ReorderQueueDto, UpdateQueueEntryDto, QueueFilterDto } from './dto/queue.dto';

function todayDate(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00.000Z');
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
    private etaService: EtaService,
  ) {}

  private buildDateFilter(filter: QueueFilterDto) {
    if (filter.dateFrom || filter.dateTo) {
      return {
        ...(filter.dateFrom ? { gte: parseDate(filter.dateFrom) } : {}),
        ...(filter.dateTo ? { lte: parseDate(filter.dateTo) } : {}),
      };
    }
    if (filter.date) return { gte: parseDate(filter.date), lte: parseDate(filter.date) };
    // default: today only
    const start = todayDate();
    const end = new Date(start.getTime() + 86400000 - 1);
    return { gte: start, lte: end };
  }

  // Receptionist view — can filter by doctor, slot, date range
  async findAll(filter: QueueFilterDto = {}) {
    const dateFilter = this.buildDateFilter(filter);
    return this.prisma.queueEntry.findMany({
      where: {
        date: dateFilter,
        ...(filter.doctorId ? { doctorId: filter.doctorId } : {}),
        ...(filter.slotId ? { slotId: filter.slotId } : {}),
      },
      orderBy: [{ doctorId: 'asc' }, { position: 'asc' }],
      include: {
        patient: { select: { id: true, name: true, contact: true } },
        doctor: { select: { id: true, name: true, specialization: true } },
        slot: { select: { id: true, label: true, startTime: true, endTime: true } },
      },
    });
  }

  // Doctor view — today only, their queue only
  async findMine(doctorId: string) {
    const start = todayDate();
    const end = new Date(start.getTime() + 86400000 - 1);
    return this.prisma.queueEntry.findMany({
      where: {
        doctorId,
        date: { gte: start, lte: end },
        status: { in: ['waiting' as any, 'in_consultation' as any] },
      },
      orderBy: { position: 'asc' },
      include: {
        patient: { select: { id: true, name: true, contact: true } },
        slot: { select: { id: true, label: true, startTime: true, endTime: true } },
      },
    });
  }

  async findOne(id: string) {
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id },
      include: { patient: true, doctor: true, slot: true },
    });
    if (!entry) throw new NotFoundException('Queue entry not found');
    return entry;
  }

  private assertOwnership(entry: { doctorId: string | null }, requester: { sub: string; role: string }) {
    if (requester.role === 'doctor' && entry.doctorId !== requester.sub) {
      throw new NotFoundException('Queue entry not found');
    }
  }

  async checkIn(dto: CheckInDto) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    const doctor = await this.prisma.user.findUnique({ where: { id: dto.doctorId } });
    if (!doctor || doctor.role !== 'doctor') throw new NotFoundException('Doctor not found');

    const slot = await this.prisma.doctorSlot.findUnique({ where: { id: dto.slotId } });
    if (!slot) throw new NotFoundException('Slot not found');

    const today = todayDate();

    // Token number = next in this doctor+slot+date combo
    const lastInSlot = await this.prisma.queueEntry.findFirst({
      where: { doctorId: dto.doctorId, slotId: dto.slotId, date: today },
      orderBy: { tokenNumber: 'desc' },
    });
    const tokenNumber = (lastInSlot?.tokenNumber ?? 0) + 1;

    // Position = end of this doctor's active queue
    const lastInLine = await this.prisma.queueEntry.findFirst({
      where: {
        doctorId: dto.doctorId,
        date: today,
        status: { in: ['waiting' as any, 'in_consultation' as any] },
      },
      orderBy: { position: 'desc' },
    });
    const position = (lastInLine?.position ?? 0) + 1;

    const entry = await this.prisma.queueEntry.create({
      data: {
        patientId: patient.id,
        patientName: patient.name,
        patientContact: patient.contact,
        doctorId: dto.doctorId,
        slotId: dto.slotId,
        date: today,
        tokenNumber,
        position,
        priority: (dto.priority ?? 'normal') as any,
      },
      include: {
        patient: true,
        doctor: true,
        slot: true,
      },
    });

    try { await this.broadcastQueue(dto.doctorId); } catch (e) {
      this.logger.error(`Broadcast failed after check-in`, e);
    }
    return entry;
  }

  async callNext(doctorId: string) {
    const today = todayDate();
    const end = new Date(today.getTime() + 86400000 - 1);

    // Record tap for RACT (Layer 5)
    this.etaService.recordTap(doctorId);

    // Finish current in_consultation entry
    const current = await this.prisma.queueEntry.findFirst({
      where: { doctorId, date: { gte: today, lte: end }, status: 'in_consultation' as any },
    });
    if (current) {
      const completedAt = new Date();
      await this.prisma.queueEntry.update({
        where: { id: current.id },
        data: { status: 'completed' as any, completedAt },
      });
      // Feed consultation duration into ETA engine
      if (current.calledAt) {
        const durationSecs = Math.round((completedAt.getTime() - current.calledAt.getTime()) / 1000);
        await this.etaService.recordConsultation(doctorId, durationSecs);
        // Also write to Visit history
        await this.prisma.visit.create({
          data: {
            patientId: current.patientId,
            doctorId,
            startedAt: current.calledAt,
            completedAt,
            consultationSeconds: durationSecs,
          },
        });
      }
    }

    // Find next waiting (priority first, then position)
    const next = await this.prisma.queueEntry.findFirst({
      where: { doctorId, date: { gte: today, lte: end }, status: 'waiting' as any },
      orderBy: [{ priority: 'asc' }, { position: 'asc' }],
      include: { patient: true, doctor: true, slot: true },
    });

    if (!next) {
      this.eventsGateway.emitQueueUpdated({ doctorId, queue: [] });
      return { nextEntry: null, message: 'Queue is empty' };
    }

    const called = await this.prisma.queueEntry.update({
      where: { id: next.id },
      data: { status: 'in_consultation' as any, calledAt: new Date() },
      include: { patient: true, doctor: true, slot: true },
    });

    // Broadcast "Now Calling" to receptionist
    this.eventsGateway.emitNowCalling({
      doctorId,
      doctorName: called.doctor?.name ?? '',
      tokenNumber: called.tokenNumber,
      patientName: called.patient.name,
    });

    try { await this.broadcastQueue(doctorId); } catch (e) {
      this.logger.error('Broadcast failed after callNext', e);
    }

    return { nextEntry: called };
  }

  async update(id: string, dto: UpdateQueueEntryDto, requester: { sub: string; role: string }) {
    const existing = await this.findOne(id);
    this.assertOwnership(existing, requester);

    const data: Record<string, unknown> = { ...dto };
    if (dto.status === 'in_consultation' as any && existing.status !== 'in_consultation' as any) {
      data.calledAt = new Date();
    }
    if (dto.status === 'completed' as any && existing.status !== 'completed' as any) {
      data.completedAt = new Date();
      if (existing.calledAt) {
        const durationSecs = Math.round((Date.now() - existing.calledAt.getTime()) / 1000);
        if (existing.doctorId) {
          await this.etaService.recordConsultation(existing.doctorId, durationSecs);
          await this.prisma.visit.create({
            data: {
              patientId: existing.patientId,
              doctorId: existing.doctorId,
              startedAt: existing.calledAt,
              completedAt: new Date(),
              consultationSeconds: durationSecs,
            },
          });
        }
      }
    }

    const updated = await this.prisma.queueEntry.update({
      where: { id },
      data,
      include: { patient: true, doctor: true, slot: true },
    });

    if (updated.doctorId) {
      try { await this.broadcastQueue(updated.doctorId); } catch (e) {
        this.logger.error('Broadcast failed after update', e);
      }
    }
    return updated;
  }

  async remove(id: string, requester: { sub: string; role: string }) {
    const existing = await this.findOne(id);
    this.assertOwnership(existing, requester);
    await this.prisma.queueEntry.delete({ where: { id } });
    if (existing.doctorId) {
      try { await this.broadcastQueue(existing.doctorId); } catch (e) {
        this.logger.error('Broadcast failed after remove', e);
      }
    }
    return { message: 'Removed from queue' };
  }

  async reorder(doctorId: string, dto: ReorderQueueDto) {
    const entries = await this.prisma.queueEntry.findMany({ where: { id: { in: dto.orderedIds } } });
    const mismatched = entries.find(e => e.doctorId !== doctorId);
    if (mismatched || entries.length !== dto.orderedIds.length) {
      throw new ForbiddenException('One or more queue entries do not belong to this doctor');
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.queueEntry.update({ where: { id }, data: { position: index + 1 } }),
      ),
    );
    await this.broadcastQueue(doctorId);
    return this.findMine(doctorId);
  }

  private async broadcastQueue(doctorId: string) {
    const queue = await this.findMine(doctorId);
    this.eventsGateway.emitQueueUpdated({ doctorId, queue });
    await this.etaService.refreshAndBroadcast(doctorId);
  }
}
