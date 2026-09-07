-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('TENANT_OWNER', 'ADMIN', 'BRANCH_STAFF');

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_tenant_id_email_key" ON "staff"("tenant_id", "email");
CREATE INDEX "staff_tenant_id_idx" ON "staff"("tenant_id");

ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff" FORCE ROW LEVEL SECURITY;

CREATE POLICY staff_isolation ON "staff"
  FOR ALL
  USING (
    current_setting('app.platform', true) = 'on'
    OR (
      current_setting('app.tenant_id', true) <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.platform', true) = 'on'
    OR (
      current_setting('app.tenant_id', true) <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  );
