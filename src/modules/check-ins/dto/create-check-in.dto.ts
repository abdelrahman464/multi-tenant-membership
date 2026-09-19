import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { normalizeMemberCode } from '../../members/utils/member-code.util';

export class CreateCheckInDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeMemberCode(value))
  @IsString()
  @Length(8, 8)
  @Matches(/^[2-9A-HJ-NP-Z]{8}$/)
  memberCode?: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;
}
