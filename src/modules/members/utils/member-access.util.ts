import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';

export const memberOnBooksWhere = {
  status: { not: 'ARCHIVED' },
} satisfies Prisma.MemberWhereInput;

export function assertMemberCanCheckIn(status: string): void {
  if (status === 'ARCHIVED') {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.MEMBER_ARCHIVED,
      'Archived members cannot check in',
    );
  }
  if (status === 'BLOCKED') {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.MEMBER_BLOCKED,
      'Blocked members cannot check in',
    );
  }
}

export function assertMemberCanBeSold(status: string): void {
  if (status === 'ARCHIVED') {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.MEMBER_ARCHIVED,
      'Archived members cannot join a plan',
    );
  }
  if (status === 'BLOCKED') {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.MEMBER_BLOCKED,
      'Blocked members cannot join a plan',
    );
  }
}
