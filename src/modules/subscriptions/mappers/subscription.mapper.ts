import { Prisma } from '@prisma/client';
import { SUBSCRIPTION_INCLUDE } from '../constants/subscription.constants';
import {
  accessUntilOf,
  graceDaysFromSettings,
  isCalendarGrace,
} from '../utils/access.util';

export type SubscriptionRow = Prisma.SubscriptionGetPayload<{
  include: typeof SUBSCRIPTION_INCLUDE;
}>;

export type PublicSubscription = {
  id: string;
  memberId: string;
  planId: string;
  planName: string;
  durationDays: number;
  sessionCount: number | null;
  sessionsRemaining: number | null;
  maxVisitsPerDay: number;
  price: number;
  currency: string;
  allBranches: boolean;
  startsAt: Date;
  endsAt: Date;
  frozenAt: Date | null;
  freezeEndsAt: Date | null;
  expiredAt: Date | null;
  graceUsedAt: Date | null;
  graceEndsAt: Date | null;
  accessUntil: Date;
  inGrace: boolean;
  status: SubscriptionRow['status'];
  createdAt: Date;
  member: SubscriptionRow['member'];
  plan: {
    id: string;
    name: string;
    status: SubscriptionRow['plan']['status'];
  };
  branches: { id: string; name: string }[];
};

export function toPublicSubscription(
  row: SubscriptionRow,
  now = new Date(),
): PublicSubscription {
  const graceDays = graceDaysFromSettings(row.tenant.settings);
  const accessUntil = accessUntilOf(row.endsAt, graceDays);
  const inGrace =
    row.status === 'IN_GRACE' ||
    (row.status === 'EXPIRED' &&
      !row.graceUsedAt &&
      isCalendarGrace(row.endsAt, now, graceDays));

  return {
    id: row.id,
    memberId: row.memberId,
    planId: row.planId,
    planName: row.planName,
    durationDays: row.durationDays,
    sessionCount: row.sessionCount,
    sessionsRemaining: row.sessionsRemaining,
    maxVisitsPerDay: row.maxVisitsPerDay,
    price: Number(row.price),
    currency: row.tenant.currency,
    allBranches: row.allBranches,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    frozenAt: row.frozenAt,
    freezeEndsAt: row.freezeEndsAt,
    expiredAt: row.expiredAt,
    graceUsedAt: row.graceUsedAt,
    graceEndsAt: row.graceEndsAt,
    accessUntil,
    inGrace,
    status: row.status,
    createdAt: row.createdAt,
    member: row.member,
    plan: {
      id: row.plan.id,
      name: row.plan.name,
      status: row.plan.status,
    },
    branches: allowedBranches(row),
  };
}

function allowedBranches(row: SubscriptionRow): { id: string; name: string }[] {
  const rows = row.allBranches
    ? row.tenant.branches
    : row.plan.branches.map((link) => link.branch);
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}
