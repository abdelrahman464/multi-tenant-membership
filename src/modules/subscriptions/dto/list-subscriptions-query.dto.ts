import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { SubscriptionStatus } from '../enums/subscription-status.enum';

function toQueryBoolean({ value }: { value: unknown }) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

export class ListSubscriptionsQueryDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsUUID()
  soldByStaffId?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  /** Remaining due > 0 (zero paid or partial). Active members, not cancelled. */
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  unpaid?: boolean;

  /** Still running: usable dates/sessions, not expired, pack not used up. */
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  inProgress?: boolean;

  /** Finished (expired or pack used up) and no newer sold plan of the same product. */
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  completedUnrenewed?: boolean;

  /** Status EXPIRED after settle (includes later renewals of the same plan). */
  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  expired?: boolean;

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
