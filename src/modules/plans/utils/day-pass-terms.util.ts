import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { PlanKind } from '../enums/plan-kind.enum';

export function assertDayPassTerms(
  durationDays: number | undefined,
  sessionCount: number | null | undefined,
): void {
  if (durationDays != null && durationDays !== 1) {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.PLAN_DAY_PASS_TERMS,
      'A day pass is 1 day and 1 visit',
    );
  }
  if (sessionCount != null && sessionCount !== 1) {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.PLAN_DAY_PASS_TERMS,
      'A day pass is 1 day and 1 visit',
    );
  }
}

export function resolvePlanTerms(input: {
  kind: PlanKind;
  durationDays?: number;
  sessionCount?: number | null;
  maxVisitsPerDay?: number;
}): {
  kind: PlanKind;
  durationDays: number;
  sessionCount: number | null;
  maxVisitsPerDay: number;
} {
  if (input.kind === PlanKind.DAY_PASS) {
    assertDayPassTerms(input.durationDays, input.sessionCount);
    return {
      kind: PlanKind.DAY_PASS,
      durationDays: 1,
      sessionCount: 1,
      maxVisitsPerDay: input.maxVisitsPerDay ?? 1,
    };
  }
  return {
    kind: PlanKind.MEMBERSHIP,
    durationDays: input.durationDays as number,
    sessionCount: input.sessionCount ?? null,
    maxVisitsPerDay: input.maxVisitsPerDay ?? 1,
  };
}
