import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import {
  assertMemberCanBeSold,
  assertMemberCanCheckIn,
} from './member-access.util';

function thrownCode(run: () => void): string {
  try {
    run();
  } catch (error) {
    if (error instanceof AppHttpException) {
      const body = error.getResponse() as { code: string };
      return body.code;
    }
  }
  throw new Error('expected AppHttpException');
}

describe('member-access', () => {
  it('lets an active member through the door and onto a plan', () => {
    expect(() => assertMemberCanCheckIn('ACTIVE')).not.toThrow();
    expect(() => assertMemberCanBeSold('ACTIVE')).not.toThrow();
  });

  it('refuses archived and blocked at the door', () => {
    expect(thrownCode(() => assertMemberCanCheckIn('ARCHIVED'))).toBe(
      ErrorCode.MEMBER_ARCHIVED,
    );
    expect(thrownCode(() => assertMemberCanCheckIn('BLOCKED'))).toBe(
      ErrorCode.MEMBER_BLOCKED,
    );
  });

  it('refuses archived and blocked on a new sale', () => {
    expect(thrownCode(() => assertMemberCanBeSold('ARCHIVED'))).toBe(
      ErrorCode.MEMBER_ARCHIVED,
    );
    expect(thrownCode(() => assertMemberCanBeSold('BLOCKED'))).toBe(
      ErrorCode.MEMBER_BLOCKED,
    );
  });
});

