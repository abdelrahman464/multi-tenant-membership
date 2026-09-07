/** Strip spaces and punctuation so "+20 100 123 4567" becomes "+201001234567". */
export function normalizeE164(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

/**
 * E.164: + then 8–15 digits, first digit 1–9.
 * Egypt example: +201001234567
 */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
