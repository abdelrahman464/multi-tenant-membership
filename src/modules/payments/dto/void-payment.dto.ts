import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoidPaymentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
