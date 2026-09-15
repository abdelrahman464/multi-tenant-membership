import { IsOptional, Matches } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class DashboardQueryDto {
  /** Inclusive gym-calendar start (`YYYY-MM-DD`). Defaults to today. */
  @IsOptional()
  @Matches(YMD, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  /** Inclusive gym-calendar end (`YYYY-MM-DD`). Defaults to `from` or today. */
  @IsOptional()
  @Matches(YMD, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
