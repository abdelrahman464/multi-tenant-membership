import { WEEKDAYS, type BranchHours } from '../constants/branch-hours.constants';
import {
  isBranchOpen,
  parseBranchHours,
  parseHoursExceptions,
  parseHm,
} from './branch-hours.util';

const openDay = { open: '06:00', close: '22:00' };
const overnight = { open: '22:00', close: '06:00' };
const allDay = { open: '00:00', close: '24:00' };

function week(fill: BranchHours[keyof BranchHours]): BranchHours {
  return Object.fromEntries(WEEKDAYS.map((day) => [day, fill])) as BranchHours;
}

describe('branch-hours.util', () => {
  it('parses HH:MM and 24:00', () => {
    expect(parseHm('00:00')).toBe(0);
    expect(parseHm('06:30')).toBe(390);
    expect(parseHm('24:00')).toBe(1440);
    expect(parseHm('25:00')).toBeNull();
  });

  it('requires all seven weekdays', () => {
    expect(parseBranchHours({ monday: openDay })).toBeNull();
    expect(parseBranchHours(week(openDay))).toEqual(week(openDay));
    expect(parseBranchHours(week(null))).toEqual(week(null));
    expect(parseBranchHours({ ...week(openDay), monday: { open: '10:00', close: '10:00' } })).toBeNull();
  });

  it('treats null hours as always open', () => {
    const now = new Date('2026-09-19T12:00:00.000Z');
    expect(isBranchOpen(null, now, 'Africa/Cairo')).toBe(true);
  });

  it('uses the gym timezone weekday and close is exclusive', () => {
    const cairoSaturdayAfternoon = new Date('2026-09-19T12:00:00.000Z');
    const cairoSaturdayClose = new Date('2026-09-19T20:00:00.000Z');
    const openSaturday = { ...week(null), saturday: openDay };
    expect(isBranchOpen(openSaturday, cairoSaturdayAfternoon, 'Africa/Cairo')).toBe(
      true,
    );
    expect(isBranchOpen(openSaturday, cairoSaturdayClose, 'Africa/Cairo')).toBe(
      false,
    );
    expect(isBranchOpen(week(null), cairoSaturdayAfternoon, 'Africa/Cairo')).toBe(
      false,
    );
    expect(isBranchOpen(week(allDay), cairoSaturdayClose, 'Africa/Cairo')).toBe(
      true,
    );
  });

  it('keeps overnight hours open after midnight from the previous day', () => {
    const sundayNight = new Date('2026-09-20T20:30:00.000Z');
    const mondayMorning = new Date('2026-09-20T22:30:00.000Z');
    const hours = { ...week(null), sunday: overnight };
    expect(isBranchOpen(hours, sundayNight, 'Africa/Cairo')).toBe(true);
    expect(isBranchOpen(hours, mondayMorning, 'Africa/Cairo')).toBe(true);
  });

  it('parses date exceptions and rejects duplicates', () => {
    expect(
      parseHoursExceptions([
        { date: '2026-09-21', hours: openDay },
        { date: '2026-09-20', hours: null },
      ]),
    ).toEqual([
      { date: '2026-09-20', hours: null },
      { date: '2026-09-21', hours: openDay },
    ]);
    expect(
      parseHoursExceptions([
        { date: '2026-09-20', hours: null },
        { date: '2026-09-20', hours: openDay },
      ]),
    ).toBeNull();
    expect(parseHoursExceptions({ date: '2026-09-20', hours: null })).toBeNull();
  });

  it('lets a date exception close a 24/7 branch or replace the weekly window', () => {
    const afternoon = new Date('2026-09-19T12:00:00.000Z');
    const closedToday = [{ date: '2026-09-19', hours: null }];
    const shortToday = [
      { date: '2026-09-19', hours: { open: '10:00', close: '14:00' } },
    ];
    expect(isBranchOpen(null, afternoon, 'Africa/Cairo', closedToday)).toBe(
      false,
    );
    expect(isBranchOpen(week(allDay), afternoon, 'Africa/Cairo', closedToday)).toBe(
      false,
    );
    expect(isBranchOpen(null, afternoon, 'Africa/Cairo', shortToday)).toBe(false);
    expect(
      isBranchOpen(null, new Date('2026-09-19T09:00:00.000Z'), 'Africa/Cairo', shortToday),
    ).toBe(true);
  });

  it('does not spill overnight into a closed exception day', () => {
    const mondayMorning = new Date('2026-09-20T22:30:00.000Z');
    const hours = { ...week(null), sunday: overnight };
    expect(
      isBranchOpen(hours, mondayMorning, 'Africa/Cairo', [
        { date: '2026-09-21', hours: null },
      ]),
    ).toBe(false);
  });
});
