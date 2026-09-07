import { Prisma } from '@prisma/client';
import { addUtcDays } from '../utils/freeze.util';

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
  const settings = row.tenant.settings;
  const graceDays =
    settings?.graceEnabled && settings.graceDays > 0 ? settings.graceDays : 0;
  const accessUntil = addUtcDays(row.endsAt, graceDays);
  const inGrace =
    row.status === 'ACTIVE' && now > row.endsAt && now <= accessUntil;

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
    accessUntil,
    inGrace,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
