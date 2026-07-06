import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PatientJwtGuard } from '../patient-auth/patient-jwt.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// ── Patient routes (B2C) ──────────────────────────────────────────────────────
@Controller('patient/symptoms')
@UseGuards(PatientJwtGuard)
export class PatientSymptomsController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async log(@CurrentUser() user: any, @Body() body: {
    symptoms: string[];
    severity: number;
    notes?: string;
    recordedAt?: string;
  }) {
    return this.prisma.symptomLog.create({
      data: {
        patientId: user.sub,
        symptoms: body.symptoms,
        severity: Math.min(10, Math.max(1, body.severity)),
        notes: body.notes,
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
      },
    });
  }

  @Get()
  async getMine(@CurrentUser() user: any) {
    return this.prisma.symptomLog.findMany({
      where: { patientId: user.sub },
      orderBy: { recordedAt: 'desc' },
    });
  }
}

// ── Doctor/B2B route — view patient symptom history ───────────────────────────
@Controller('patients/:patientId/symptoms')
@UseGuards(JwtAuthGuard)
export class DoctorSymptomsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getForPatient(@Param('patientId') patientId: string) {
    return this.prisma.symptomLog.findMany({
      where: { patientId },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });
  }
}
