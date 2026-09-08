import { Transform, Type } from 'class-transformer';
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
import { NotificationType } from '../enums/notification-type.enum';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  unread?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

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
