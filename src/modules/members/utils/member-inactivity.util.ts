import { Prisma } from '@prisma/client';


export function memberInactivityWhere(query: {
  neverVisited?: boolean;
  inactiveDays?: number;
}): Prisma.MemberWhereInput {
  if (query.neverVisited === true) {
    return { lastCheckedInAt: null };
  }
  if (query.inactiveDays) {
    const cutoff = new Date(
      Date.now() - query.inactiveDays * 24 * 60 * 60 * 1000,
    );
    return {
      OR: [{ lastCheckedInAt: null }, { lastCheckedInAt: { lt: cutoff } }],
    };
  }
  return {};
}
