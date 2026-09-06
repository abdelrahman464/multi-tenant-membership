-- Freeze is one gym-wide rule: time plans and session packs share it.
ALTER TABLE "tenant_settings" DROP COLUMN "pack_freeze_enabled";
