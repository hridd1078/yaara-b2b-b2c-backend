import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateBillDto, QueryBillsDto, UpdateBillDto } from './dto/bill.dto';

@Injectable()
export class BillsService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  findAll(query: QueryBillsDto) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.patientId) where.patientId = query.patientId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo + 'T23:59:59.999Z') } : {}),
      };
    }
    return this.prisma.bill.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { id: true, name: true, contact: true } },
        doctor: { select: { id: true, name: true } },
      },
    });
  }

  /** Doctor's own invoices only — for "what did I bill this week" style views. */
  findMine(doctorId: string) {
    return this.prisma.bill.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
      include: { patient: { select: { id: true, name: true, contact: true } } },
    });
  }

  async findOne(id: string, requester?: { sub: string; role: string }) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: { patient: true, doctor: { select: { id: true, name: true } } },
    });
    if (!bill) {
      throw new NotFoundException('Bill not found');
    }
    if (requester?.role === 'doctor' && bill.doctorId !== requester.sub) {
      // 404 rather than 403 so we don't confirm the bill exists to a doctor who shouldn't see it
      throw new NotFoundException('Bill not found');
    }
    return bill;
  }

  async create(dto: CreateBillDto) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    if (dto.doctorId) {
      const doctor = await this.prisma.user.findUnique({ where: { id: dto.doctorId } });
      if (!doctor || doctor.role !== 'doctor') throw new NotFoundException('Doctor not found');
    }

    // Support both {description, amount} and {description, quantity, unitPrice} item formats
    const totalAmount = dto.totalAmount ?? dto.items.reduce((sum, item) => {
      return sum + (item.amount ?? (item.quantity ?? 1) * (item.unitPrice ?? 0));
    }, 0);

    const yaraFee = dto.yaraFee ?? 0;

    const bill = await this.prisma.bill.create({
      data: {
        patientId: patient.id,
        patientName: dto.patientName ?? patient.name,
        doctorId: dto.doctorId,
        items: dto.items as any,
        totalAmount,
        yaraFee,
        paymentMethod: dto.paymentMethod,
        status: (dto.status ?? 'pending') as any,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : null,
      },
      include: { patient: true, doctor: { select: { id: true, name: true } } },
    });

    this.eventsGateway.emitBillUpdated({ bill });
    return bill;
  }

  async update(id: string, dto: UpdateBillDto) {
    await this.findOne(id);

    const bill = await this.prisma.bill.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status as any } : {}),
        ...(dto.paymentMethod ? { paymentMethod: dto.paymentMethod } : {}),
        ...(dto.totalAmount != null ? { totalAmount: dto.totalAmount } : {}),
        ...(dto.yaraFee != null ? { yaraFee: dto.yaraFee } : {}),
        ...(dto.status === 'paid' ? { paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date() } : {}),
      },
      include: { patient: true, doctor: { select: { id: true, name: true } } },
    });

    this.eventsGateway.emitBillUpdated({ bill });
    return bill;
  }
}
