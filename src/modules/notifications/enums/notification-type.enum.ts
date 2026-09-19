export enum NotificationType {
  /** Written at check-in while endsAt < now <= accessUntil. Not on settle. */
  SUBSCRIPTION_IN_GRACE = 'SUBSCRIPTION_IN_GRACE',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  /** Written on settle while ACTIVE and endsAt is within 7 rolling days. */
  SUBSCRIPTION_ENDING_SOON = 'SUBSCRIPTION_ENDING_SOON',
  CHECKIN_BRANCH_BLOCKED = 'CHECKIN_BRANCH_BLOCKED',
}
