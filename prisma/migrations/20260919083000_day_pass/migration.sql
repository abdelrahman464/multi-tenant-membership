-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('MEMBERSHIP', 'DAY_PASS');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN "kind" "PlanKind" NOT NULL DEFAULT 'MEMBERSHIP';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "kind" "PlanKind" NOT NULL DEFAULT 'MEMBERSHIP';

-- CreateIndex
CREATE INDEX "plans_tenant_id_kind_idx" ON "plans"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_kind_idx" ON "subscriptions"("tenant_id", "kind");

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DAY_PASS_SOLD';
