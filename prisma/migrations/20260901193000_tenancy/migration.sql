-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CountryCode" AS ENUM ('EG');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" "CountryCode" NOT NULL DEFAULT 'EG',
    "timezone" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "grace_enabled" BOOLEAN NOT NULL DEFAULT false,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "freeze_enabled" BOOLEAN NOT NULL DEFAULT false,
    "pack_freeze_enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_freeze_days" INTEGER NOT NULL DEFAULT 0,
    "max_freeze_days_per_year" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "branches_tenant_id_name_key" ON "branches"("tenant_id", "name");
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: defense in depth. FORCE applies even to the table owner
-- (our Nest user). Without FORCE, the owner would skip policies — a missed
-- WHERE tenant_id = ... would leak another gym.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_isolation ON "tenants"
  FOR ALL
  USING (
    current_setting('app.platform', true) = 'on'
    OR (
      current_setting('app.tenant_id', true) <> ''
      AND id = current_setting('app.tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    current_setting('app.platform', true) = 'on'
    OR (
      current_setting('app.tenant_id', true) <> ''
      AND id = current_setting('app.tenant_id', true)::uuid
    )
  );

CREATE POLICY tenant_settings_isolation ON "tenant_settings"
  FOR ALL
  USING (
    current_setting('app.platform', true) = 'on'
    OR (
      current_setting('app.tenant_id', true) <> ''
      AND tenant_id = current_setting('app.tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    current_setting('app.platform', true) = 'on'
    OR (
      current_setting('app.tenant_id', true) <> ''
      AND tenant_id = current_setting('app.tenant_id', true)::uuid
    )
  );

CREATE POLICY branches_isolation ON "branches"
  FOR ALL
  USING (
    current_setting('app.platform', true) = 'on'
    OR (
      current_setting('app.tenant_id', true) <> ''
      AND tenant_id = current_setting('app.tenant_id', true)::uuid
    )
  )
  WITH CHECK (
    current_setting('app.platform', true) = 'on'
    OR (
      current_setting('app.tenant_id', true) <> ''
      AND tenant_id = current_setting('app.tenant_id', true)::uuid
    )
  );
