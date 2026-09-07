-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "duration_days" INTEGER,
    "session_count" INTEGER,
    "price" DECIMAL(12,2) NOT NULL,
    "all_branches" BOOLEAN NOT NULL DEFAULT true,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plans_offer_chk" CHECK (
      ("duration_days" IS NULL OR "duration_days" >= 1)
      AND ("session_count" IS NULL OR "session_count" >= 1)
      AND ("duration_days" IS NOT NULL OR "session_count" IS NOT NULL)
      AND "price" >= 0
    )
);

CREATE UNIQUE INDEX "plans_tenant_id_name_key" ON "plans"("tenant_id", "name");
CREATE INDEX "plans_tenant_id_idx" ON "plans"("tenant_id");

ALTER TABLE "plans" ADD CONSTRAINT "plans_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "plan_branches" (
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "plan_branches_pkey" PRIMARY KEY ("plan_id", "branch_id")
);

CREATE INDEX "plan_branches_tenant_id_idx" ON "plan_branches"("tenant_id");
CREATE INDEX "plan_branches_branch_id_idx" ON "plan_branches"("branch_id");

ALTER TABLE "plan_branches" ADD CONSTRAINT "plan_branches_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_branches" ADD CONSTRAINT "plan_branches_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_branches" ADD CONSTRAINT "plan_branches_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plans" FORCE ROW LEVEL SECURITY;

CREATE POLICY plans_isolation ON "plans"
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

ALTER TABLE "plan_branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_branches" FORCE ROW LEVEL SECURITY;

CREATE POLICY plan_branches_isolation ON "plan_branches"
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

GRANT USAGE ON TYPE "PlanStatus" TO membership_app;
