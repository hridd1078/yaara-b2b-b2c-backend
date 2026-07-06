import { Module } from '@nestjs/common';
import { PatientSymptomsController, DoctorSymptomsController } from './symptoms.controller';

@Module({ controllers: [PatientSymptomsController, DoctorSymptomsController] })
export class SymptomsModule {}
