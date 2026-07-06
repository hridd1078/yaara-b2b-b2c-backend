import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { QueueService } from './queue.service';
import { CheckInDto, ReorderQueueDto, UpdateQueueEntryDto, QueueFilterDto } from './dto/queue.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  // Receptionist: all entries with optional filters
  @Get()
  findAll(@Query() filter: QueueFilterDto) {
    return this.queueService.findAll(filter);
  }

  // Doctor: their own queue, today only
  @Get('mine')
  findMine(@CurrentUser() user: any) {
    return this.queueService.findMine(user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.queueService.findOne(id);
  }

  @Post('check-in')
  checkIn(@Body() dto: CheckInDto) {
    return this.queueService.checkIn(dto);
  }

  // Doctor clicks "Next" — finishes current, calls next patient
  @Post('call-next')
  callNext(@CurrentUser() user: any) {
    return this.queueService.callNext(user.sub);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQueueEntryDto,
    @CurrentUser() user: any,
  ) {
    return this.queueService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.queueService.remove(id, user);
  }

  @Post('reorder')
  reorder(@Body() dto: ReorderQueueDto & { doctorId: string }) {
    return this.queueService.reorder(dto.doctorId, dto);
  }
}
