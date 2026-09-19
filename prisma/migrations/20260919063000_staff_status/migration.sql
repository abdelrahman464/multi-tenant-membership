CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "staff" ADD COLUMN "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "staff_tenant_id_status_idx" ON "staff"("tenant_id", "status");

ALTER TYPE "AuditAction" ADD VALUE 'STAFF_UPDATED';
