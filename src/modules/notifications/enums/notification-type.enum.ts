export enum NotificationType {
  /** Written at check-in while endsAt < now <= accessUntil. Not on settle. */
  SUBSCRIPTION_IN_GRACE = 'SUBSCRIPTION_IN_GRACE',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
}
