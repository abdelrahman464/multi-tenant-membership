import { Notification, NotificationType } from '@prisma/client';

export type PublicNotification = {
  id: string;
  tenantId: string;
  type: NotificationType;
  subscriptionId: string;
  memberId: string;
  memberName: string;
  planName: string;
  message: string;
  unread: boolean;
  readAt: Date | null;
  createdAt: Date;
};

export function notificationMessage(
  type: NotificationType,
  memberName: string,
  planName: string,
): string {
  if (type === 'SUBSCRIPTION_IN_GRACE') {
    return `${memberName}'s ${planName} used a grace day`;
  }
  return `${memberName}'s ${planName} has expired`;
}

export function toPublicNotification(row: Notification): PublicNotification {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    subscriptionId: row.subscriptionId,
    memberId: row.memberId,
    memberName: row.memberName,
    planName: row.planName,
    message: notificationMessage(row.type, row.memberName, row.planName),
    unread: row.readAt === null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}
