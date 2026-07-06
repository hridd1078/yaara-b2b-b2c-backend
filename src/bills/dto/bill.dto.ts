import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class BillItemDto {
  @IsNotEmpty() @IsString() description: string;
  @IsNumber() amount: number;
  // also accept quantity+unitPrice format for flexibility
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsNumber() unitPrice?: number;
}

export class CreateBillDto {
  @IsNotEmpty() @IsString() patientId: string;
  @IsOptional() @IsString() doctorId?: string;
  @IsOptional() @IsString() patientName?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => BillItemDto) items: BillItemDto[];
  @IsOptional() @IsNumber() totalAmount?: number;
  @IsOptional() @IsNumber() yaraFee?: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() paidAt?: string;
}

export class UpdateBillDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsNumber() totalAmount?: number;
  @IsOptional() @IsNumber() yaraFee?: number;
  @IsOptional() @IsString() paidAt?: string;
}

export class QueryBillsDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}
