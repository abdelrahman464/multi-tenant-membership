import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/constants/error-codes';
import { AppHttpException } from '../../../common/errors/app-http.exception';

export async function requireActiveBranch(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
): Promise<{
  id: string;
  name: string;
  hours: Prisma.JsonValue | null;
  hoursExceptions: Prisma.JsonValue | null;
}> {
  const branch = await tx.branch.findFirst({
    where: { id: branchId, tenantId },
    select: { id: true, name: true, status: true, hours: true, hoursExceptions: true },
  });
  if (!branch) {
    throw new AppHttpException(
      HttpStatus.NOT_FOUND,
      ErrorCode.BRANCH_NOT_FOUND,
      'Branch not found',
    );
  }
  if (branch.status === 'ARCHIVED') {
    throw new AppHttpException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.BRANCH_ARCHIVED,
      'This branch is archived',
    );
  }
  return {
    id: branch.id,
    name: branch.name,
    hours: branch.hours,
    hoursExceptions: branch.hoursExceptions,
  };
}
