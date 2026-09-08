import { addUtcDays, MS_PER_DAY } from './freeze.util';

export function graceDaysFromSettings(
  settings: { graceEnabled: boolean; graceDays: number } | null | undefined,
): number {
  return settings?.graceEnabled && settings.graceDays > 0
    ? settings.graceDays
    : 0;
}

export function accessUntilOf(endsAt: Date, graceDays: number): Date {
  return addUtcDays(endsAt, graceDays);
}

/** IN_GRACE rows with endsAt <= this instant have passed accessUntil. */
export function expiryCutoff(now: Date, graceDays: number): Date {
  return new Date(now.getTime() - graceDays * MS_PER_DAY);
}

export function isCalendarGrace(
  endsAt: Date,
  now: Date,
  graceDays: number,
): boolean {
  return now > endsAt && now <= accessUntilOf(endsAt, graceDays);
}
