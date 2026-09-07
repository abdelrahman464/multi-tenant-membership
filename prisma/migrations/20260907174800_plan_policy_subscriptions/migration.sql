-- Every plan has a calendar length. Pack-only rows from Phase 4 get 30 days.
UPDATE "plans" SET "duration_days" = 30 WHERE "duration_days" IS NULL;

ALTER TABLE "plans" ALTER COLUMN "duration_days" SET NOT NULL;

ALTER TABLE "plans" ADD COLUMN "max_visits_per_day" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "plans" DROP CONSTRAINT "plans_offer_chk";
ALTER TABLE "plans" ADD CONSTRAINT "plans_offer_chk" CHECK (
  "duration_days" >= 1
  AND ("session_count" IS NULL OR "session_count" >= 1)
  AND "max_visits_per_day" >= 1
  AND "price" >= 0
);

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_name" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "session_count" INTEGER,
    "sessions_remaining" INTEGER,
    "max_visits_per_day" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "all_branches" BOOLEAN NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions"("tenant_id");
CREATE INDEX "subscriptions_member_id_idx" ON "subscriptions"("member_id");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_isolation ON "subscriptions"
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

GRANT USAGE ON TYPE "SubscriptionStatus" TO membership_app;
