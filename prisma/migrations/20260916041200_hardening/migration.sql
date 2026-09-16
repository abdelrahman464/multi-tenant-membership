-- Hot-path indexes for dashboard, reports, expiry settle, and unread inbox.
CREATE INDEX "members_tenant_id_status_idx" ON "members"("tenant_id", "status");
CREATE INDEX "members_tenant_id_created_at_idx" ON "members"("tenant_id", "created_at");
CREATE INDEX "subscriptions_tenant_id_status_ends_at_idx"
  ON "subscriptions"("tenant_id", "status", "ends_at");
CREATE INDEX "check_ins_tenant_id_checked_in_at_idx"
  ON "check_ins"("tenant_id", "checked_in_at");
CREATE INDEX "payments_tenant_id_paid_at_idx" ON "payments"("tenant_id", "paid_at");
CREATE INDEX "notifications_tenant_id_read_at_idx"
  ON "notifications"("tenant_id", "read_at");

CREATE TYPE "AuditAction" AS ENUM (
  'LOGIN',
  'PASSWORD_CHANGED',
  'MEMBER_CREATED',
  'MEMBER_UPDATED',
  'PLAN_CREATED',
  'PLAN_UPDATED',
  'STAFF_CREATED',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_FROZEN',
  'SUBSCRIPTION_UNFROZEN',
  'SUBSCRIPTION_RENEWED',
  'CHECK_IN_CREATED',
  'PAYMENT_CREATED',
  'SETTINGS_UPDATED',
  'REPORT_EXPORTED'
);

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_events_tenant_id_created_at_idx"
  ON "audit_events"("tenant_id", "created_at");
CREATE INDEX "audit_events_tenant_id_action_idx"
  ON "audit_events"("tenant_id", "action");
CREATE INDEX "audit_events_staff_id_idx" ON "audit_events"("staff_id");

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_events_isolation ON "audit_events"
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

GRANT USAGE ON TYPE "AuditAction" TO membership_app;
