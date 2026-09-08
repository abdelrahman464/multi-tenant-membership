ALTER TYPE "SubscriptionStatus" ADD VALUE 'IN_GRACE';

CREATE TABLE "check_ins" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "check_ins_tenant_id_idx" ON "check_ins"("tenant_id");
CREATE INDEX "check_ins_member_id_idx" ON "check_ins"("member_id");
CREATE INDEX "check_ins_subscription_id_checked_in_at_idx"
  ON "check_ins"("subscription_id", "checked_in_at");
CREATE INDEX "check_ins_branch_id_idx" ON "check_ins"("branch_id");

ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "check_ins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "check_ins" FORCE ROW LEVEL SECURITY;

CREATE POLICY check_ins_isolation ON "check_ins"
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
