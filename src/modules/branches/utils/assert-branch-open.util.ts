import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { isBranchOpen } from './branch-hours.util';

export function assertBranchOpen(
  hours: unknown,
  now: Date,
  timeZone: string,
  hoursExceptions?: unknown,
): void {
  if (isBranchOpen(hours, now, timeZone, hoursExceptions)) {
    return;
  }
  throw new AppHttpException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.BRANCH_CLOSED,
    'This branch is closed',
  );
}
