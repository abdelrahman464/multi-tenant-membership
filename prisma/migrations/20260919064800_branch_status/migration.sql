CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "branches" ADD COLUMN "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "branches_tenant_id_status_idx" ON "branches"("tenant_id", "status");

ALTER TYPE "AuditAction" ADD VALUE 'BRANCH_CREATED';

ALTER TYPE "AuditAction" ADD VALUE 'BRANCH_UPDATED';
