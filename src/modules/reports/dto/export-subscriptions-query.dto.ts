import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PlanKind } from '../../plans/enums/plan-kind.enum';
import { SubscriptionStatus } from '../../subscriptions/enums/subscription-status.enum';

function toQueryBoolean({ value }: { value: unknown }) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

export class ExportSubscriptionsQueryDto {
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
  @IsUUID()
  cancelledByStaffId?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsEnum(PlanKind)
  kind?: PlanKind;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  unpaid?: boolean;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  inProgress?: boolean;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  completedUnrenewed?: boolean;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  expired?: boolean;

  @IsOptional()
  @Transform(toQueryBoolean)
  @IsBoolean()
  endingSoon?: boolean;
}
