import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { PrismaService } from '../../../database/prisma.service';
import { STAFF_PUBLIC_SELECT } from '../constants/staff.constants';
import { CreateStaffDto } from '../dto/create-staff.dto';

@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTenantBySlug(slug: string) {
    return this.prisma.withPlatform((tx) =>
      tx.tenant.findUnique({
        where: { slug },
        select: { id: true, slug: true, status: true },
      }),
    );
  }

  findByEmailWithPassword(tenantId: string, email: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findUnique({
        where: { tenantId_email: { tenantId, email } },
      }),
    );
  }

  findByIdInTenant(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findFirst({
        where: { id, tenantId },
        include: { tenant: { select: { id: true, status: true } } },
      }),
    );
  }

  findByIdWithPassword(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findFirst({
        where: { id, tenantId },
      }),
    );
  }

  findMany(tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.findMany({
        where: { tenantId },
        select: STAFF_PUBLIC_SELECT,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async create(tenantId: string, data: CreateStaffDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (data.branchId) {
        const branch = await tx.branch.findFirst({
          where: { id: data.branchId, tenantId },
        });
        if (!branch) {
          throw new AppHttpException(
            HttpStatus.NOT_FOUND,
            ErrorCode.BRANCH_NOT_FOUND,
            'Branch not found',
          );
        }
      }

      return tx.staff.create({
        data: {
          tenantId,
          name: data.name,
          email: data.email,
          password: data.password,
          role: data.role,
          branchId: data.branchId ?? null,
        },
        select: STAFF_PUBLIC_SELECT,
      });
    });
  }

  bumpSessionVersion(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.update({
        where: { id },
        data: { sessionVersion: { increment: 1 } },
        select: STAFF_PUBLIC_SELECT,
      }),
    );
  }

  updatePassword(
    tenantId: string,
    id: string,
    password: string,
    options: { bumpSessionVersion: boolean },
  ) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.staff.update({
        where: { id },
        data: {
          password,
          ...(options.bumpSessionVersion
            ? { sessionVersion: { increment: 1 } }
            : {}),
        },
      }),
    );
  }

  isUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }

  emailTakenError(): AppHttpException {
    return new AppHttpException(
      HttpStatus.CONFLICT,
      ErrorCode.STAFF_EMAIL_TAKEN,
      'A staff member with this email already exists in this tenant',
    );
  }
}
