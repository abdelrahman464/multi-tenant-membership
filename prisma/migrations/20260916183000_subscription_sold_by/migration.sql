ALTER TABLE "subscriptions"
  ADD COLUMN "sold_by_staff_id" UUID;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_sold_by_staff_id_fkey"
  FOREIGN KEY ("sold_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "subscriptions_sold_by_staff_id_idx" ON "subscriptions"("sold_by_staff_id");
