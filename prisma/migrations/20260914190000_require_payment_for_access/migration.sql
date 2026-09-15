ALTER TABLE "tenant_settings"
  ADD COLUMN "require_payment_for_access" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "min_paid_percent_for_access" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_min_paid_percent_chk"
  CHECK ("min_paid_percent_for_access" >= 0 AND "min_paid_percent_for_access" <= 100);
