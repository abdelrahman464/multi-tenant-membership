import { memberInactivityWhere } from './member-inactivity.util';

describe('memberInactivityWhere', () => {
  it('returns empty when neither filter is set', () => {
    expect(memberInactivityWhere({})).toEqual({});
  });

  it('neverVisited is lastCheckedInAt null', () => {
    expect(memberInactivityWhere({ neverVisited: true })).toEqual({
      lastCheckedInAt: null,
    });
  });

  it('inactiveDays includes never visited and last visit before the cutoff', () => {
    const before = Date.now();
    const where = memberInactivityWhere({ inactiveDays: 14 });
    const after = Date.now();

    expect(where.OR).toHaveLength(2);
    expect(where.OR?.[0]).toEqual({ lastCheckedInAt: null });
    const cutoff = (where.OR?.[1] as { lastCheckedInAt: { lt: Date } })
      .lastCheckedInAt.lt;
    const expectedMin = before - 14 * 24 * 60 * 60 * 1000;
    const expectedMax = after - 14 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoff.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});
