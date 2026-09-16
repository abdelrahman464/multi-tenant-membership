import { Prisma } from '@prisma/client';
import { AUDIT_INCLUDE } from '../constants/audit.constants';

export type AuditEventRow = Prisma.AuditEventGetPayload<{
  include: typeof AUDIT_INCLUDE;
}>;

export type PublicAuditEvent = {
  id: string;
  action: AuditEventRow['action'];
  entityType: string | null;
  entityId: string | null;
  metadata: Prisma.JsonValue | null;
  ip: string | null;
  createdAt: Date;
  staff: AuditEventRow['staff'];
};

export function toPublicAuditEvent(row: AuditEventRow): PublicAuditEvent {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata,
    ip: row.ip,
    createdAt: row.createdAt,
    staff: row.staff,
  };
}
