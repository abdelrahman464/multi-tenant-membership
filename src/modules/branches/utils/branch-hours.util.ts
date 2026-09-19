import { Prisma } from '@prisma/client';
import {
  addYmdDays,
  isYmd,
  zonedClock,
  zonedYmd,
} from '../../check-ins/utils/tenant-day.util';
import {
  HOURS_EXCEPTIONS_MAX,
  WEEKDAYS,
  type BranchHours,
  type DayHours,
  type HoursException,
  type Weekday,
} from '../constants/branch-hours.constants';

export function toBranchHoursWrite(hours?: BranchHours | null) {
  if (hours === undefined) {
    return {};
  }
  return { hours: hours === null ? Prisma.DbNull : hours };
}

export function toHoursExceptionsWrite(exceptions?: HoursException[] | null) {
  if (exceptions === undefined) {
    return {};
  }
  const parsed = parseHoursExceptions(exceptions);
  if (!parsed || parsed.length === 0) {
    return { hoursExceptions: Prisma.DbNull };
  }
  return { hoursExceptions: parsed };
}

const OPEN_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_PATTERN = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export function parseHm(value: string): number | null {
  if (value === '24:00') {
    return 1440;
  }
  const match = OPEN_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(value.slice(3));
}

/** `undefined` = invalid. `null` = closed. */
export function parseDayHours(slot: unknown): DayHours | null | undefined {
  if (slot === null) {
    return null;
  }
  if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
    return undefined;
  }
  const open = (slot as { open?: unknown }).open;
  const close = (slot as { close?: unknown }).close;
  if (typeof open !== 'string' || typeof close !== 'string') {
    return undefined;
  }
  if (!OPEN_PATTERN.test(open) || !CLOSE_PATTERN.test(close)) {
    return undefined;
  }
  const openMinute = parseHm(open);
  const closeMinute = parseHm(close);
  if (openMinute === null || closeMinute === null || openMinute === closeMinute) {
    return undefined;
  }
  return { open, close };
}

export function parseBranchHours(value: unknown): BranchHours | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const hours = {} as BranchHours;
  for (const day of WEEKDAYS) {
    if (!(day in row)) {
      return null;
    }
    const slot = parseDayHours(row[day]);
    if (slot === undefined) {
      return null;
    }
    hours[day] = slot;
  }
  return hours;
}

export function parseHoursExceptions(value: unknown): HoursException[] | null {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > HOURS_EXCEPTIONS_MAX) {
    return null;
  }
  const seen = new Set<string>();
  const rows: HoursException[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const date = (item as { date?: unknown }).date;
    if (typeof date !== 'string' || !isYmd(date) || seen.has(date)) {
      return null;
    }
    if (!('hours' in item)) {
      return null;
    }
    const hours = parseDayHours((item as { hours: unknown }).hours);
    if (hours === undefined) {
      return null;
    }
    seen.add(date);
    rows.push({ date, hours });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function isBranchOpen(
  hours: unknown,
  now: Date,
  timeZone: string,
  hoursExceptions?: unknown,
): boolean {
  const clock = zonedClock(now, timeZone);
  if (!WEEKDAYS.includes(clock.weekday as Weekday)) {
    return true;
  }
  const weekday = clock.weekday as Weekday;
  const { minute } = clock;
  const today = zonedYmd(now, timeZone);
  const exceptions = parseHoursExceptions(hoursExceptions ?? null);
  const todayException = exceptions?.find((row) => row.date === today);
  if (todayException) {
    return slotContains(todayException.hours, minute);
  }

  if (hours == null) {
    return true;
  }
  const weekly = parseBranchHours(hours);
  if (!weekly) {
    return true;
  }
  if (slotContains(weekly[weekday], minute)) {
    return true;
  }

  const yesterdayYmd = addYmdDays(today, -1);
  const yesterdayException = exceptions?.find((row) => row.date === yesterdayYmd);
  if (yesterdayException) {
    return overnightCoversMorning(yesterdayException.hours, minute);
  }
  const yesterday = WEEKDAYS[(WEEKDAYS.indexOf(weekday) + 6) % 7];
  return overnightCoversMorning(weekly[yesterday], minute);
}

function slotContains(slot: DayHours | null, minute: number): boolean {
  if (!slot) {
    return false;
  }
  const open = parseHm(slot.open);
  const close = parseHm(slot.close);
  if (open === null || close === null) {
    return false;
  }
  if (open === 0 && close === 1440) {
    return true;
  }
  if (close > open) {
    return minute >= open && minute < close;
  }
  return minute >= open || minute < close;
}

function overnightCoversMorning(slot: DayHours | null, minute: number): boolean {
  return Boolean(slot && isOvernight(slot) && minute < (parseHm(slot.close) ?? 0));
}

function isOvernight(slot: DayHours): boolean {
  const open = parseHm(slot.open);
  const close = parseHm(slot.close);
  return open !== null && close !== null && close < open;
}
