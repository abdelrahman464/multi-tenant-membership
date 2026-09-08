-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SUBSCRIPTION_IN_GRACE', 'SUBSCRIPTION_EXPIRED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "subscription_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "member_name" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_tenant_id_type_subscription_id_key"
  ON "notifications"("tenant_id", "type", "subscription_id");
CREATE INDEX "notifications_tenant_id_idx" ON "notifications"("tenant_id");
CREATE INDEX "notifications_member_id_idx" ON "notifications"("member_id");
CREATE INDEX "notifications_subscription_id_idx" ON "notifications"("subscription_id");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_isolation ON "notifications"
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

GRANT USAGE ON TYPE "NotificationType" TO membership_app;
