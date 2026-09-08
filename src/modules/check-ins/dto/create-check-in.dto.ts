import { IsOptional, IsUUID } from 'class-validator';

export class CreateCheckInDto {
  @IsUUID()
  memberId!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;
}
