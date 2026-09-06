import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TenantStatus } from '../enums/tenant-status.enum';

export class ListTenantsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  /** Comma list. Prefix `-` for desc: `-createdAt,name` */
  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
