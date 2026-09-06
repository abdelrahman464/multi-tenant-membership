import { Type } from 'class-transformer';
import {
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateBranchDto } from './create-branch.dto';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** Optional. If omitted, generated from name (`delta-swim`, then `-1`, `-2`). */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case (e.g. delta-swim)',
  })
  slug?: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CreateBranchDto)
  firstBranch!: CreateBranchDto;
}

/** HTTP body plus country defaults. Used only when writing to Postgres. */
export class PersistTenantDto {
  name!: string;
  slug!: string;
  firstBranch!: CreateBranchDto;
  timezone!: string;
  currency!: string;
}
