ALTER TABLE "members" ADD COLUMN "last_checked_in_at" TIMESTAMP(3);

UPDATE "members" AS m
SET "last_checked_in_at" = c.max_at
FROM (
  SELECT "tenant_id", "member_id", MAX("checked_in_at") AS max_at
  FROM "check_ins"
  GROUP BY "tenant_id", "member_id"
) AS c
WHERE m."tenant_id" = c."tenant_id" AND m."id" = c."member_id";

CREATE INDEX "members_tenant_id_last_checked_in_at_idx"
  ON "members"("tenant_id", "last_checked_in_at");
