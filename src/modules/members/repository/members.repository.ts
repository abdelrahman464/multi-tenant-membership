import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import { requireActiveBranch } from '../../tenants/utils/require-active-branch.util';
import {
  MEMBER_FILTER_FIELDS,
  MEMBER_PUBLIC_SELECT,
  MEMBER_SEARCH_FIELDS,
  MEMBER_SORT_FIELDS,
} from '../constants/member.constants';
import { ListMembersQueryDto } from '../dto/list-members-query.dto';
import { CreateMemberDto } from '../dto/create-member.dto';
import { UpdateMemberDto } from '../dto/update-member.dto';
import { generateMemberCode } from '../utils/member-code.util';

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string, query: ListMembersQueryDto) {
    const features = new ApiFeatures(
      query as unknown as Record<string, unknown>,
    )
      .filter(MEMBER_FILTER_FIELDS)
      .search(MEMBER_SEARCH_FIELDS)
      .sort(MEMBER_SORT_FIELDS)
      .paginate();

    const { where, orderBy, skip, take } = features.args();
    const scopedWhere: Prisma.MemberWhereInput = {
      ...(where as Prisma.MemberWhereInput),
      tenantId,
    };

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [data, total] = await Promise.all([
        tx.member.findMany({
          where: scopedWhere,
          orderBy: orderBy as Prisma.MemberOrderByWithRelationInput[],
          skip,
          take,
          select: MEMBER_PUBLIC_SELECT,
        }),
        tx.member.count({ where: scopedWhere }),
      ]);
      return features.paginateResult(data, total);
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.member.findFirst({
        where: { id, tenantId },
        select: MEMBER_PUBLIC_SELECT,
      }),
    );
  }

  async create(tenantId: string, data: CreateMemberDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertHomeBranch(tx, tenantId, data.homeBranchId);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          return await tx.member.create({
            data: {
              tenantId,
              name: data.name,
              phone: data.phone,
              email: data.email,
              homeBranchId: data.homeBranchId,
              notes: data.notes,
              code: generateMemberCode(),
            },
            select: MEMBER_PUBLIC_SELECT,
          });
        } catch (error) {
          if (uniqueTargetIncludes(error, 'code') && attempt < 4) {
            continue;
          }
          throw error;
        }
      }
      throw new Error('Could not allocate a unique member code');
    });
  }

  async update(tenantId: string, id: string, data: UpdateMemberDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.member.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) {
        return null;
      }
      if (data.homeBranchId) {
        await this.assertHomeBranch(tx, tenantId, data.homeBranchId);
      }
      return tx.member.update({
        where: { id },
        data,
        select: MEMBER_PUBLIC_SELECT,
      });
    });
  }

  isUniqueConflict(error: unknown): boolean {
    return isPrismaUniqueConflict(error);
  }

  phoneTakenError(): AppHttpException {
    return new AppHttpException(
      HttpStatus.CONFLICT,
      ErrorCode.MEMBER_PHONE_TAKEN,
      'A member with this phone already exists in this tenant',
    );
  }

  private async assertHomeBranch(
    tx: Prisma.TransactionClient,
    tenantId: string,
    homeBranchId: string,
  ): Promise<void> {
    await requireActiveBranch(tx, tenantId, homeBranchId);
  }
}

function isPrismaUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}

function uniqueTargetIncludes(error: unknown, field: string): boolean {
  if (!isPrismaUniqueConflict(error)) {
    return false;
  }
  const meta = (error as { meta?: Record<string, unknown> }).meta;
  const target = meta?.target;
  if (Array.isArray(target) && target.includes(field)) {
    return true;
  }
  if (target === field) {
    return true;
  }
  const adapter = meta?.driverAdapterError as
    { cause?: { originalMessage?: string; constraint?: string } } | undefined;
  const hint = [adapter?.cause?.originalMessage, adapter?.cause?.constraint]
    .filter(Boolean)
    .join(' ');
  return hint.includes(field);
}
