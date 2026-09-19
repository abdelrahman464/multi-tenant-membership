import {
  generateMemberCode,
  MEMBER_CODE_LENGTH,
  normalizeMemberCode,
} from './member-code.util';

describe('member-code.util', () => {
  it('generates an 8-character desk alphabet code', () => {
    const code = generateMemberCode();
    expect(code).toHaveLength(MEMBER_CODE_LENGTH);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
  });

  it('strips spaces and dashes and uppercases', () => {
    expect(normalizeMemberCode('ab-2k 9m')).toBe('AB2K9M');
  });
});
