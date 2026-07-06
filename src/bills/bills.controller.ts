import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';

import { BillsService } from './bills.service';
import { CreateBillDto, QueryBillsDto, UpdateBillDto } from './dto/bill.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('bills')
@UseGuards(RolesGuard)
export class BillsController {
  constructor(private billsService: BillsService) {}

  @Get()
  @Roles('receptionist')
  findAll(@Query() query: QueryBillsDto) {
    return this.billsService.findAll(query);
  }

  // Doctor's own invoices — read-only, no cross-doctor visibility
  @Get('me')
  @Roles('receptionist')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.billsService.findMine(user.sub);
  }

  @Get(':id')
  @Roles('receptionist', 'doctor')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.billsService.findOne(id, { sub: user.sub, role: user.role });
  }

  @Post()
  @Roles('receptionist')
  create(@Body() dto: CreateBillDto) {
    return this.billsService.create(dto);
  }

  @Put(':id')
  @Roles('receptionist')
  update(@Param('id') id: string, @Body() dto: UpdateBillDto) {
    return this.billsService.update(id, dto);
  }
}
