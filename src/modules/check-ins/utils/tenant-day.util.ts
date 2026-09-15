/** Civil YYYY-MM-DD in the gym timezone (Africa/Cairo for Egypt). */
export function zonedYmd(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    hour: n('hour'),
    minute: n('minute'),
    second: n('second'),
  };
}

export function addYmdDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

/** UTC instant of `ymd` 00:00:00 in `timeZone`. */
export function zonedStartOfDay(ymd: string, timeZone: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  let millis = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(millis), timeZone);
    const got = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    const want = Date.UTC(year, month - 1, day, 0, 0, 0);
    const delta = want - got;
    if (delta === 0) break;
    millis += delta;
  }
  return new Date(millis);
}

/** Inclusive start / exclusive end of the gym's civil day, as UTC instants. */
export function zonedDayBounds(
  now: Date,
  timeZone: string,
): { today: string; gte: Date; lt: Date } {
  const today = zonedYmd(now, timeZone);
  return {
    today,
    gte: zonedStartOfDay(today, timeZone),
    lt: zonedStartOfDay(addYmdDays(today, 1), timeZone),
  };
}

export const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value: string): boolean {
  if (!YMD_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/** Inclusive civil-day count (`2026-09-01`..`2026-09-01` is 1). */
export function ymdInclusiveDayCount(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.floor((end - start) / 86_400_000) + 1;
}

/** Inclusive gym-calendar range as UTC `[gte, lt)`. */
export function zonedYmdRangeBounds(
  fromYmd: string,
  toYmd: string,
  timeZone: string,
): { gte: Date; lt: Date } {
  return {
    gte: zonedStartOfDay(fromYmd, timeZone),
    lt: zonedStartOfDay(addYmdDays(toYmd, 1), timeZone),
  };
}
