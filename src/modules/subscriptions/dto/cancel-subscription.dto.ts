import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelSubscriptionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
