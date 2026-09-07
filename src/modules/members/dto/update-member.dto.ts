import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { normalizeE164 } from '../../../common/utils/phone.util';
import { MemberStatus } from '../enums/member-status.enum';

export class UpdateMemberDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeE164(value) : value,
  )
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be E.164 (e.g. +201001234567)',
  })
  phone?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsUUID()
  homeBranchId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;
}
