import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { QueueModule } from './queue/queue.module';
import { EtaModule } from './eta/eta.module';
import { BillsModule } from './bills/bills.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { EventsModule } from './events/events.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { PatientAuthModule } from './patient-auth/patient-auth.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { SymptomsModule } from './symptoms/symptoms.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EventsModule,
    PatientsModule,
    EtaModule,
    QueueModule,
    BillsModule,
    AnalyticsModule,
    HospitalsModule,
    PatientAuthModule,
    AppointmentsModule,
    SymptomsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
