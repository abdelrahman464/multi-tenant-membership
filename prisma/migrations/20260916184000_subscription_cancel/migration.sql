ALTER TABLE "subscriptions"
  ADD COLUMN "cancelled_by_staff_id" UUID,
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancel_reason" TEXT;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_cancelled_by_staff_id_fkey"
  FOREIGN KEY ("cancelled_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "subscriptions_cancelled_by_staff_id_idx" ON "subscriptions"("cancelled_by_staff_id");

ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_CANCELLED';
