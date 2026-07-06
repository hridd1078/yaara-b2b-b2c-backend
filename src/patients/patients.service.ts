import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryPatientsDto) {
    const { search, page, pageSize } = query;

    const where: any = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { contact: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  // Doctor's "quick-access panel" — patient details plus recent visit history.
  // Doctors only see visits/notes from their own consultations with this patient;
  // receptionists (who don't do clinical work) see the full cross-doctor history
  // since they're coordinating care, not reading clinical notes.
  async findHistory(id: string, requester: { sub: string; role: string }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        visits: {
          where: requester.role === 'doctor' ? { doctorId: requester.sub } : {},
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            doctor: { select: { id: true, name: true, specialization: true } },
          },
        },
        bills: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  async create(dto: CreatePatientDto) {
    // Check for duplicate by phone number
    const existing = await this.prisma.patient.findFirst({ where: { contact: dto.contact } });
    if (existing) {
      throw new ConflictException('A patient with this phone number already exists');
    }
    return this.prisma.patient.create({
      data: {
        name: dto.name,
        email: dto.email,
        contact: dto.contact,
        dateOfBirth: dto.dateOfBirth,
        address: dto.address,
        bloodGroup: dto.bloodGroup,
        medicalHistory: dto.medicalHistory,
      },
    });
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.findOne(id);
    return this.prisma.patient.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.patient.delete({ where: { id } });
    return { message: 'Patient deleted' };
  }
}
