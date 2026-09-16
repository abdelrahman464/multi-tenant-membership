CREATE TYPE "PaymentStatus" AS ENUM ('COLLECTED', 'VOIDED');

ALTER TABLE "payments"
  ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'COLLECTED',
  ADD COLUMN "voided_by_id" UUID,
  ADD COLUMN "void_reason" TEXT,
  ADD COLUMN "voided_at" TIMESTAMP(3);

ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_id_fkey"
  FOREIGN KEY ("voided_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_void_chk" CHECK (
  (
    "status" = 'COLLECTED'
    AND "voided_at" IS NULL
    AND "voided_by_id" IS NULL
    AND "void_reason" IS NULL
  )
  OR (
    "status" = 'VOIDED'
    AND "voided_at" IS NOT NULL
    AND "voided_by_id" IS NOT NULL
    AND char_length(btrim("void_reason")) >= 3
  )
);

CREATE INDEX "payments_tenant_id_status_idx" ON "payments"("tenant_id", "status");

ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_VOIDED';

GRANT USAGE ON TYPE "PaymentStatus" TO membership_app;
