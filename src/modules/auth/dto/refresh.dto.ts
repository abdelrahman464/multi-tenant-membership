import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  /** Optional when the httpOnly refresh cookie is present (Postman / non-browser). */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
