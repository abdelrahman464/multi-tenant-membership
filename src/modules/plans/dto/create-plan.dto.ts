import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PlanKind } from '../enums/plan-kind.enum';

export class CreatePlanDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** MEMBERSHIP (default) or DAY_PASS (forced 1 day / 1 visit). */
  @IsOptional()
  @IsEnum(PlanKind)
  kind?: PlanKind;

  /** Calendar length in days. Required for memberships. Day pass defaults to 1. */
  @ValidateIf((dto: CreatePlanDto) => dto.kind !== PlanKind.DAY_PASS)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  /** Optional visit pack. Omit for unlimited visits until durationDays ends. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  sessionCount?: number;

  /** How many check-ins are allowed on one calendar day. Default 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  maxVisitsPerDay?: number;

  /** Major units of the gym currency (EGP). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  price!: number;

  /** Default true: every location. false: branchIds required. */
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  branchIds?: string[];
}
