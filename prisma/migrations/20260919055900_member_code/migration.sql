ALTER TABLE "members" ADD COLUMN "code" TEXT;

UPDATE "members" AS m
SET "code" = (
  SELECT string_agg(ch, '' ORDER BY n)
  FROM generate_series(0, 7) AS n
  CROSS JOIN LATERAL (
    SELECT substr(
      '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
      (get_byte(decode(md5(m.id::text || n::text), 'hex'), 0) % 31) + 1,
      1
    ) AS ch
  ) s
);

ALTER TABLE "members" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "members_tenant_id_code_key" ON "members"("tenant_id", "code");
