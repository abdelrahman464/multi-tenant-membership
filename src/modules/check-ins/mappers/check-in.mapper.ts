import { CheckIn, SubscriptionStatus } from '@prisma/client';

export type PublicCheckIn = {
  id: string;
  tenantId: string;
  memberId: string;
  subscriptionId: string;
  branchId: string;
  staffId: string;
  checkedInAt: Date;
  usedGrace: boolean;
  status: SubscriptionStatus;
  sessionsRemaining: number | null;
  visitsToday: number;
};

export function toPublicCheckIn(
  row: CheckIn,
  extras: {
    usedGrace: boolean;
    status: SubscriptionStatus;
    sessionsRemaining: number | null;
    visitsToday: number;
  },
): PublicCheckIn {
  return {
    id: row.id,
    tenantId: row.tenantId,
    memberId: row.memberId,
    subscriptionId: row.subscriptionId,
    branchId: row.branchId,
    staffId: row.staffId,
    checkedInAt: row.checkedInAt,
    usedGrace: extras.usedGrace,
    status: extras.status,
    sessionsRemaining: extras.sessionsRemaining,
    visitsToday: extras.visitsToday,
  };
}
