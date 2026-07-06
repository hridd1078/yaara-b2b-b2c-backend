import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { SlotsController } from './slots.controller';
import { EventsModule } from '../events/events.module';
import { EtaModule } from '../eta/eta.module';

@Module({
  imports: [EventsModule, EtaModule],
  controllers: [QueueController, SlotsController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
