import {
  addYmdDays,
  isYmd,
  ymdInclusiveDayCount,
  zonedDayBounds,
  zonedStartOfDay,
  zonedYmd,
  zonedYmdRangeBounds,
} from './tenant-day.util';

describe('tenant-day.util', () => {
  const timeZone = 'Africa/Cairo';

  it('maps midnight of a Cairo day to that YMD and the previous instant to yesterday', () => {
    const start = zonedStartOfDay('2026-09-15', timeZone);
    expect(zonedYmd(start, timeZone)).toBe('2026-09-15');
    expect(zonedYmd(new Date(start.getTime() - 1), timeZone)).toBe(
      '2026-09-14',
    );
  });

  it('gives a half-open range that covers only that civil day', () => {
    const noonUtc = new Date('2026-09-15T12:00:00.000Z');
    const { today, gte, lt } = zonedDayBounds(noonUtc, timeZone);
    expect(today).toBe(zonedYmd(noonUtc, timeZone));
    expect(gte.getTime()).toBeLessThan(lt.getTime());
    expect(zonedYmd(gte, timeZone)).toBe(today);
    expect(zonedYmd(new Date(lt.getTime() - 1), timeZone)).toBe(today);
    expect(zonedYmd(lt, timeZone)).not.toBe(today);
  });

  it('accepts real calendar days and counts an inclusive range', () => {
    expect(isYmd('2026-09-15')).toBe(true);
    expect(isYmd('2026-02-31')).toBe(false);
    expect(ymdInclusiveDayCount('2026-09-01', '2026-09-01')).toBe(1);
    expect(ymdInclusiveDayCount('2026-09-01', '2026-09-03')).toBe(3);
  });

  it('covers an inclusive multi-day Cairo range', () => {
    const { gte, lt } = zonedYmdRangeBounds(
      '2026-09-14',
      '2026-09-15',
      timeZone,
    );
    expect(zonedYmd(gte, timeZone)).toBe('2026-09-14');
    expect(zonedYmd(new Date(lt.getTime() - 1), timeZone)).toBe('2026-09-15');
    expect(zonedYmd(lt, timeZone)).toBe(addYmdDays('2026-09-15', 1));
  });
});
