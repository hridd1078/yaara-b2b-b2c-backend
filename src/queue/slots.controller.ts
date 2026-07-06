import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('slots')
export class SlotsController {
  constructor(private prisma: PrismaService) {}

  @Get('doctor/:doctorId')
  getByDoctor(@Param('doctorId') doctorId: string) {
    return this.prisma.doctorSlot.findMany({
      where: { doctorId },
      orderBy: { startTime: 'asc' },
    });
  }
}
