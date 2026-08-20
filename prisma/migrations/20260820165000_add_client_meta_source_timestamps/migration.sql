-- AlterTable
ALTER TABLE "ClientMetaCampaign" ADD COLUMN "metaCreatedAt" DATETIME;
ALTER TABLE "ClientMetaAdset" ADD COLUMN "startsAt" DATETIME;
ALTER TABLE "ClientMetaAdset" ADD COLUMN "metaCreatedAt" DATETIME;
ALTER TABLE "ClientMetaAd" ADD COLUMN "metaCreatedAt" DATETIME;
