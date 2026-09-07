export const MS_PER_DAY = 86_400_000;

export function addUtcDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

type FreezeEpisode = {
  days: number;
  startedAt: Date;
  endedAt: Date;
  unfrozenAt: Date | null;
};

/** Days already counted toward the rolling 365-day cap (open freezes reserve their full request). */
export function freezeDaysUsedThisYear(
  freezes: FreezeEpisode[],
  now: Date,
): number {
  const yearAgo = new Date(now.getTime() - 365 * MS_PER_DAY);
  let used = 0;
  for (const freeze of freezes) {
    const episodeEnd = freeze.unfrozenAt ?? freeze.endedAt;
    if (episodeEnd <= yearAgo) continue;
    if (!freeze.unfrozenAt) {
      used += freeze.days;
      continue;
    }
    const elapsedMs = freeze.unfrozenAt.getTime() - freeze.startedAt.getTime();
    used += Math.min(
      freeze.days,
      Math.max(0, Math.ceil(elapsedMs / MS_PER_DAY)),
    );
  }
  return used;
}
