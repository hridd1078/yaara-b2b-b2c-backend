import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PatientJwtGuard } from '../patient-auth/patient-jwt.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// ── Patient-facing routes (B2C) ───────────────────────────────────────────────
@Controller('patient/appointments')
export class PatientAppointmentsController {
  constructor(private service: AppointmentsService) {}

  @Post()
  @UseGuards(PatientJwtGuard)
  book(@CurrentUser() user: any, @Body() body: {
    doctorId: string;
    slotId: string;
    hospitalId: string;
    date: string;
    visitReason?: string;
  }) {
    return this.service.book(user.sub, body);
  }

  @Get()
  @UseGuards(PatientJwtGuard)
  list(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.service.getMyAppointments(user.sub, status);
  }

  @Get(':id/status')
  @UseGuards(PatientJwtGuard)
  liveStatus(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getLiveStatus(id, user.sub);
  }

  @Delete(':id')
  @UseGuards(PatientJwtGuard)
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancel(id, user.sub);
  }
}

// ── B2B routes (receptionist) ─────────────────────────────────────────────────
@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class B2BAppointmentsController {
  constructor(private service: AppointmentsService) {}

  // Today's app-booked patients pending check-in
  @Get('pending-checkins')
  pendingCheckIns(@CurrentUser() user: any) {
    return this.service.getPendingCheckIns(user.hospitalId);
  }

  // Receptionist checks in an app-booked patient → creates QueueEntry
  @Post(':id/check-in')
  checkIn(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.checkInAppointment(id, user.hospitalId);
  }
}
