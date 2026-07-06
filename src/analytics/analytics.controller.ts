import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('analytics')
@UseGuards(RolesGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  // Doctor's own performance dashboard
  @Get('me')
  @Roles('receptionist')
  getMine(@CurrentUser() user: JwtPayload, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getDoctorAnalytics(user.sub, query.days);
  }

  // Receptionist / clinic-wide rollup across all doctors
  @Get('clinic')
  @Roles('receptionist')
  getClinic(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getClinicAnalytics(query.days);
  }
}
