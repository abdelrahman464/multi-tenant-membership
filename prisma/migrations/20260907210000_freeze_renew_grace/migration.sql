ALTER TYPE "SubscriptionStatus" ADD VALUE 'FROZEN';

ALTER TABLE "subscriptions" ADD COLUMN "frozen_at" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "freeze_ends_at" TIMESTAMP(3);

CREATE TABLE "subscription_freezes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "days" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "unfrozen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_freezes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_freezes_days_chk" CHECK ("days" >= 1)
);

CREATE INDEX "subscription_freezes_tenant_id_idx" ON "subscription_freezes"("tenant_id");
CREATE INDEX "subscription_freezes_subscription_id_idx" ON "subscription_freezes"("subscription_id");

ALTER TABLE "subscription_freezes" ADD CONSTRAINT "subscription_freezes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_freezes" ADD CONSTRAINT "subscription_freezes_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_freezes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_freezes" FORCE ROW LEVEL SECURITY;

CREATE POLICY subscription_freezes_isolation ON "subscription_freezes"
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
