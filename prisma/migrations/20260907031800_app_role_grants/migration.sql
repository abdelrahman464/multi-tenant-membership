-- Nest connects as membership_app (not a superuser, so RLS applies).
-- migrate reset recreates the public schema and drops these grants.

GRANT USAGE ON SCHEMA public TO membership_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO membership_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO membership_app;
GRANT USAGE ON TYPE "TenantStatus" TO membership_app;
GRANT USAGE ON TYPE "CountryCode" TO membership_app;
GRANT USAGE ON TYPE "StaffRole" TO membership_app;

ALTER DEFAULT PRIVILEGES FOR ROLE multitenant IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO membership_app;
ALTER DEFAULT PRIVILEGES FOR ROLE multitenant IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO membership_app;
ALTER DEFAULT PRIVILEGES FOR ROLE multitenant IN SCHEMA public
  GRANT ALL ON TYPES TO membership_app;
