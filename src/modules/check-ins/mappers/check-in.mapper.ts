import { Prisma } from '@prisma/client';
import { CHECKIN_INCLUDE } from '../constants/check-in.constants';

export type CheckInWithRelations = Prisma.CheckInGetPayload<{
  include: typeof CHECKIN_INCLUDE;
}>;

export type PublicCheckIn = {
  id: string;
  memberId: string;
  subscriptionId: string;
  checkedInAt: Date;
  usedGrace: boolean;
  status: CheckInWithRelations['subscription']['status'];
  sessionsRemaining: number | null;
  visitsToday: number;
  member: CheckInWithRelations['member'];
  branch: CheckInWithRelations['branch'];
  staff: CheckInWithRelations['staff'];
  subscription: CheckInWithRelations['subscription'];
};

export function toPublicCheckIn(
  row: CheckInWithRelations,
  extras: {
    usedGrace: boolean;
    status: CheckInWithRelations['subscription']['status'];
    sessionsRemaining: number | null;
    visitsToday: number;
  },
): PublicCheckIn {
  return {
    id: row.id,
    memberId: row.memberId,
    subscriptionId: row.subscriptionId,
    checkedInAt: row.checkedInAt,
    usedGrace: extras.usedGrace,
    status: extras.status,
    sessionsRemaining: extras.sessionsRemaining,
    visitsToday: extras.visitsToday,
    member: row.member,
    branch: row.branch,
    staff: row.staff,
    subscription: {
      ...row.subscription,
      status: extras.status,
      sessionsRemaining: extras.sessionsRemaining,
    },
  };
}
