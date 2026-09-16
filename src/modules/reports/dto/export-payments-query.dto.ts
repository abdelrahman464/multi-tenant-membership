import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';
import { ExportDateRangeQueryDto } from './export-date-range-query.dto';

export class ExportPaymentsQueryDto extends ExportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}
