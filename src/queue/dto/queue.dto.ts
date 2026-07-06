import { IsString, IsOptional, IsArray, IsUUID, IsIn } from 'class-validator';

export class CheckInDto {
  @IsUUID() patientId: string;
  @IsUUID() doctorId: string;
  @IsUUID() slotId: string;
  @IsOptional() @IsIn(['normal','high','emergency']) priority?: string;
}

export class UpdateQueueEntryDto {
  @IsOptional() @IsIn(['waiting','in_consultation','completed','no_show']) status?: string;
  @IsOptional() @IsIn(['normal','high','emergency']) priority?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ReorderQueueDto {
  @IsArray() @IsUUID('4', { each: true }) orderedIds: string[];
}

export class QueueFilterDto {
  @IsOptional() @IsString() doctorId?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() slotId?: string;
}
