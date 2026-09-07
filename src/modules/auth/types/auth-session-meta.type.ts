export type AuthSessionMeta = {
  userId: string;
  tenantId: string;
  ip: string;
  userAgent: string;
  device: string;
  country: string;
  createdAt: string;
};

export type AuthSessionView = AuthSessionMeta & {
  sid: string;
  current: boolean;
};
