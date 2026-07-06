import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PatientAuthService } from './patient-auth.service';
import { PatientAuthController } from './patient-auth.controller';
import { PatientJwtStrategy } from './patient-jwt.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'yaara-secret', signOptions: { expiresIn: '30d' } }),
  ],
  providers: [PatientAuthService, PatientJwtStrategy],
  controllers: [PatientAuthController],
  exports: [PatientJwtStrategy],
})
export class PatientAuthModule {}
