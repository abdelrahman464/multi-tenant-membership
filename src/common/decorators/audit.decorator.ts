import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../../modules/audit/enums/audit-action.enum';

export const AUDIT_KEY = 'audit';

export type AuditOptions = {
  action: AuditAction;
  entityType?: string;
  metadata?: Record<string, string>;
  /** Dotted paths on the success body, copied into metadata (ids only). */
  metadataFromBody?: Record<string, string>;
};

export const Audit = (options: AuditOptions) => SetMetadata(AUDIT_KEY, options);
