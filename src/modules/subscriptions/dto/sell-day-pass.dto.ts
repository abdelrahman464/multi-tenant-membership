import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { normalizeE164 } from '../../../common/utils/phone.util';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';

export class SellDayPassDto {
  @IsUUID()
  planId!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  @ValidateIf((dto: SellDayPassDto) => !dto.memberId)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ValidateIf((dto: SellDayPassDto) => !dto.memberId)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeE164(value) : value,
  )
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be E.164 (e.g. +201001234567)',
  })
  phone?: string;

  @IsOptional()
  @IsUUID()
  homeBranchId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Default true: collect then walk them in. false sells only. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  checkIn?: boolean;
}
