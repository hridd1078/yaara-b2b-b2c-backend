import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { QueryPatientsDto } from './dto/query-patients.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private patientsService: PatientsService, private prisma: PrismaService) {}

  @Get()
  @Roles('receptionist', 'doctor')
  findAll(@Query() query: QueryPatientsDto) {
    return this.patientsService.findAll(query);
  }

  @Get(':id')
  @Roles('receptionist', 'doctor')
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Get(':id/history')
  @Roles('receptionist', 'doctor')
  findHistory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.patientsService.findHistory(id, { sub: user.sub, role: user.role });
  }

  // Doctor sees patient's symptom logs from their app
  @Get(':id/symptoms')
  @Roles('receptionist', 'doctor')
  async getSymptoms(@Param('id') id: string) {
    return this.prisma.symptomLog.findMany({
      where: { patientId: id },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });
  }

  @Post()
  @Roles('receptionist')
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Patch(':id')
  @Roles('receptionist')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('receptionist')
  remove(@Param('id') id: string) {
    return this.patientsService.remove(id);
  }
}
