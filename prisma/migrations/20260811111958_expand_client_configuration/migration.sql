-- AlterTable
ALTER TABLE "Client" ADD COLUMN "ghlCalendarId" TEXT;
ALTER TABLE "Client" ADD COLUMN "metaLeadFormIds" TEXT;
ALTER TABLE "Client" ADD COLUMN "metaPageId" TEXT;
ALTER TABLE "Client" ADD COLUMN "monthlyRetainerCents" INTEGER;
ALTER TABLE "Client" ADD COLUMN "revSharePercent" REAL;
ALTER TABLE "Client" ADD COLUMN "setupFeeCents" INTEGER;
ALTER TABLE "Client" ADD COLUMN "targetDealCents" INTEGER;
