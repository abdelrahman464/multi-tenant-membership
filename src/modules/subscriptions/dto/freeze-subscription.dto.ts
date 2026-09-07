import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class FreezeSubscriptionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}
