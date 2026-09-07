import { Prisma } from '@prisma/client';

type PlanRow = Prisma.PlanGetPayload<{
  include: {
    tenant: { select: { currency: true } };
    branches: {
      select: { branch: { select: { id: true; name: true } } };
    };
  };
}>;

export type PublicPlan = {
  id: string;
  tenantId: string;
  name: string;
  durationDays: number;
  sessionCount: number | null;
  maxVisitsPerDay: number;
  price: number;
  currency: string;
  allBranches: boolean;
  status: PlanRow['status'];
  branches: { id: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
};

export function toPublicPlan(plan: PlanRow): PublicPlan {
  return {
    id: plan.id,
    tenantId: plan.tenantId,
    name: plan.name,
    durationDays: plan.durationDays,
    sessionCount: plan.sessionCount,
    maxVisitsPerDay: plan.maxVisitsPerDay,
    price: Number(plan.price),
    currency: plan.tenant.currency,
    allBranches: plan.allBranches,
    status: plan.status,
    branches: plan.branches
      .map((link) => link.branch)
      .sort((a, b) => a.name.localeCompare(b.name)),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}
