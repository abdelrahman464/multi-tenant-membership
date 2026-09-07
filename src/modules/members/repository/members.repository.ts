import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PrismaService } from '../../../database/prisma.service';
import {
  MEMBER_FILTER_FIELDS,
  MEMBER_PUBLIC_SELECT,
  MEMBER_SEARCH_FIELDS,
  MEMBER_SORT_FIELDS,
} from '../constants/member.constants';
import { ListMembersQueryDto } from '../dto/list-members-query.dto';
import { CreateMemberDto } from '../dto/create-member.dto';
import { UpdateMemberDto } from '../dto/update-member.dto';

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
      return tx.member.create({
        data: {
          tenantId,
          name: data.name,
          phone: data.phone,
          email: data.email,
          homeBranchId: data.homeBranchId,
          notes: data.notes,
        },
        select: MEMBER_PUBLIC_SELECT,
      });
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
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
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
    const branch = await tx.branch.findFirst({
      where: { id: homeBranchId, tenantId },
    });
    if (!branch) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ErrorCode.BRANCH_NOT_FOUND,
        'Branch not found',
      );
    }
  }
}
