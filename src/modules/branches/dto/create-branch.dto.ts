import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IsHoursExceptions } from '../decorators/is-hours-exceptions.decorator';
import { IsWeeklyHours } from '../decorators/is-weekly-hours.decorator';
import {
  BranchHours,
  HoursException,
} from '../constants/branch-hours.constants';

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsWeeklyHours()
  hours?: BranchHours | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsHoursExceptions()
  hoursExceptions?: HoursException[] | null;
}
