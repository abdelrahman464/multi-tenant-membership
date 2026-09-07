import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;

  /**
   * If true, logout every other device.
   * Default false: only this device gets a new session.
   */
  @IsOptional()
  @IsBoolean()
  revokeOtherSessions?: boolean;
}
