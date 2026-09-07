import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AssignableStaffRole } from '../enums/staff-role.enum';

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsEnum(AssignableStaffRole)
  role!: AssignableStaffRole;

  /** Required for BRANCH_STAFF. Must be omitted for ADMIN. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
