import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AssignableStaffRole } from '../enums/staff-role.enum';
import { StaffStatus } from '../enums/staff-status.enum';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsEnum(AssignableStaffRole)
  role?: AssignableStaffRole;

  /** Required when the resulting role is BRANCH_STAFF. Must be null for ADMIN. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}
