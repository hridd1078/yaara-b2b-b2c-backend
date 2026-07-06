import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { EtaService } from './eta.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('eta')
@UseGuards(RolesGuard)
export class EtaController {
  constructor(private etaService: EtaService) {}

  // Receptionist can check any doctor's live ETA board
  @Get('doctor/:doctorId')
  @Roles('receptionist')
  getForDoctor(@Param('doctorId') doctorId: string) {
    return this.etaService.computeEtasForDoctor(doctorId);
  }

  // Doctor gets their own ETA board without needing to know/pass their id
  @Get('me')
  @Roles('receptionist')
  getMine(@CurrentUser() user: JwtPayload) {
    return this.etaService.computeEtasForDoctor(user.sub);
  }
}
