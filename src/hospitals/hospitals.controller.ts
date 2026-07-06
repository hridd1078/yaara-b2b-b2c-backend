import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PatientJwtGuard } from '../patient-auth/patient-jwt.guard';

@Controller('hospitals')
export class HospitalsController {
  constructor(private prisma: PrismaService) {}

  // Public — no auth needed for search
  @Get()
  async search(@Query('q') q?: string, @Query('city') city?: string) {
    return this.prisma.hospital.findMany({
      where: {
        isActive: true,
        ...(q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { city: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, address: true, city: true, phone: true, email: true, logoUrl: true },
      orderBy: { name: 'asc' },
    });
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.prisma.hospital.findUnique({
      where: { id },
      include: {
        users: {
          where: { role: 'doctor' },
          select: {
            id: true, name: true, specialization: true,
            slots: { select: { id: true, label: true, startTime: true, endTime: true, days: true, maxTokens: true } },
          },
        },
      },
    });
  }

  @Get(':id/doctors')
  async getDoctors(@Param('id') hospitalId: string) {
    return this.prisma.user.findMany({
      where: { hospitalId, role: 'doctor' },
      select: {
        id: true, name: true, specialization: true,
        slots: { select: { id: true, label: true, startTime: true, endTime: true, days: true, maxTokens: true } },
      },
      orderBy: { name: 'asc' },
    });
  }
}
