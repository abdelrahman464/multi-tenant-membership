import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { BranchStatus } from '../enums/branch-status.enum';
import {
  BranchHours,
  HoursException,
} from '../constants/branch-hours.constants';
import { IsHoursExceptions } from '../decorators/is-hours-exceptions.decorator';
import { IsWeeklyHours } from '../decorators/is-weekly-hours.decorator';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;

  @ValidateIf((_, value) => value !== undefined)
  @IsWeeklyHours()
  hours?: BranchHours | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsHoursExceptions()
  hoursExceptions?: HoursException[] | null;
}
