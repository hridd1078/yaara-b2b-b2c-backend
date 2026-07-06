import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';

// Separate JWT strategy for patients (B2C)
@Injectable()
export class PatientJwtStrategy extends PassportStrategy(Strategy, 'patient-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? 'yaara-secret',
    });
  }

  validate(payload: any) {
    if (payload.type !== 'patient') throw new UnauthorizedException();
    return { sub: payload.sub, email: payload.email, type: 'patient' };
  }
}

@Injectable()
export class PatientJwtGuard extends AuthGuard('patient-jwt') {}
