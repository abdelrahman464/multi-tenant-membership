ALTER TYPE "SubscriptionStatus" ADD VALUE 'EXPIRED';

ALTER TABLE "subscriptions" ADD COLUMN "expired_at" TIMESTAMP(3);
