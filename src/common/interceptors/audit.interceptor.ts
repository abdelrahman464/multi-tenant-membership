import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, from, mergeMap } from 'rxjs';
import { AUDIT_KEY, AuditOptions } from '../decorators/audit.decorator';
import { extractClientMeta } from '../../modules/auth/utils/extract-client-meta.util';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { AuditRepository } from '../../modules/audit/repository/audit.repository';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditRepository: AuditRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditOptions>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return next.handle();
    }

    return next
      .handle()
      .pipe(
        mergeMap((body) =>
          from(this.persist(context, options, body).then(() => body)),
        ),
      );
  }

  private async persist(
    context: ExecutionContext,
    options: AuditOptions,
    body: unknown,
  ): Promise<void> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const staffBody = staffFromBody(body);
    const tenantId = req.user?.tenantId ?? staffBody?.tenantId;
    const staffId = req.user?.id ?? staffBody?.id;
    if (!tenantId) {
      return;
    }

    const meta = extractClientMeta(req);
    await this.auditRepository.record({
      tenantId,
      staffId,
      action: options.action,
      entityType: options.entityType ?? null,
      entityId: entityIdOf(body, req.params?.id),
      metadata: options.metadata ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

function staffFromBody(
  body: unknown,
): { id: string; tenantId: string } | undefined {
  if (!body || typeof body !== 'object' || !('staff' in body)) {
    return undefined;
  }
  const staff = (body as { staff?: { id?: unknown; tenantId?: unknown } })
    .staff;
  if (
    staff &&
    typeof staff.id === 'string' &&
    typeof staff.tenantId === 'string'
  ) {
    return { id: staff.id, tenantId: staff.tenantId };
  }
  return undefined;
}

function entityIdOf(
  body: unknown,
  paramId?: string | string[],
): string | null {
  if (body && typeof body === 'object' && 'id' in body) {
    const id = (body as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return typeof paramId === 'string' ? paramId : null;
}
