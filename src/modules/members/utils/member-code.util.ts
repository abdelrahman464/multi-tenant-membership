/** Crockford-like alphabet: no 0/O/1/I so the desk can type a badge. */
export const MEMBER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const MEMBER_CODE_LENGTH = 8;

export function generateMemberCode(
  random = (max: number) => Math.floor(Math.random() * max),
): string {
  let code = '';
  for (let i = 0; i < MEMBER_CODE_LENGTH; i += 1) {
    code += MEMBER_CODE_ALPHABET[random(MEMBER_CODE_ALPHABET.length)];
  }
  return code;
}

/** Strip spaces/dashes and uppercase. Empty if nothing usable remains. */
export function normalizeMemberCode(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[\s-]/g, '').toUpperCase();
}
