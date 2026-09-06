/*
  Warnings:

  - You are about to drop the column `freeze_enabled` on the `tenant_settings` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "CountryCode" ADD VALUE 'SA';

-- AlterTable
ALTER TABLE "tenant_settings" DROP COLUMN "freeze_enabled";
