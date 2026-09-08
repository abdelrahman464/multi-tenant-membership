import { Prisma } from '@prisma/client';
import {
  accessUntilOf,
  graceDaysFromSettings,
  isCalendarGrace,
} from '../utils/access.util';

type SubscriptionRow = Prisma.SubscriptionGetPayload<{
  include: {
    tenant: {
      select: {
        currency: true;
        settings: { select: { graceEnabled: true; graceDays: true } };
      };
    };
  };
}>;

export type PublicSubscription = {
  id: string;
  tenantId: string;
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
  updatedAt: Date;
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
    tenantId: row.tenantId,
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
    updatedAt: row.updatedAt,
  };
}
