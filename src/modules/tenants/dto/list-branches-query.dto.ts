import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListBranchesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

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
