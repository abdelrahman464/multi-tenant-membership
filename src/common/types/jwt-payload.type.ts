/** Access JWT: `id`, `email`, `tenantId`, `sv`. Refresh JWT also has `sid`. */
export type JwtPayload = {
  id: string;
  email: string;
  tenantId: string;
  /** Staff.sessionVersion at issue time. */
  sv?: number;
  /** Redis refresh session id (`auth:session:{sid}`). */
  sid?: string;
  iat: number;
  exp?: number;
};
