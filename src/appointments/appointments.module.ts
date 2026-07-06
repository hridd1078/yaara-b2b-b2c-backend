import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PatientAppointmentsController, B2BAppointmentsController } from './appointments.controller';

@Module({
  providers: [AppointmentsService],
  controllers: [PatientAppointmentsController, B2BAppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
