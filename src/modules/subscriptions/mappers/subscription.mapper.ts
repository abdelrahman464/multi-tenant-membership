import { Prisma } from '@prisma/client';

type SubscriptionRow = Prisma.SubscriptionGetPayload<{
  include: { tenant: { select: { currency: true } } };
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
  status: SubscriptionRow['status'];
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicSubscription(row: SubscriptionRow): PublicSubscription {
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
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
