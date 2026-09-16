import { IsOptional, IsUUID } from 'class-validator';
import { ExportDateRangeQueryDto } from './export-date-range-query.dto';

export class ExportCheckInsQueryDto extends ExportDateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;
}
