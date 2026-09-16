import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { MemberStatus } from '../../members/enums/member-status.enum';

export class ExportMembersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @IsOptional()
  @IsUUID()
  homeBranchId?: string;
}
