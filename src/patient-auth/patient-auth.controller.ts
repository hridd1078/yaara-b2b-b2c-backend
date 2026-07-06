import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { PatientAuthService } from './patient-auth.service';
import { PatientJwtGuard } from './patient-jwt.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('patient/auth')
export class PatientAuthController {
  constructor(private service: PatientAuthService) {}

  @Post('register')
  register(@Body() body: { name: string; email: string; password: string; contact: string }) {
    return this.service.register(body);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  @Get('profile')
  @UseGuards(PatientJwtGuard)
  getProfile(@CurrentUser() user: any) {
    return this.service.getProfile(user.sub);
  }

  @Patch('profile')
  @UseGuards(PatientJwtGuard)
  updateProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.service.updateProfile(user.sub, body);
  }
}
