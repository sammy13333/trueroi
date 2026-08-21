-- AlterTable
ALTER TABLE "ClientSyncLog" ADD COLUMN "details" TEXT;
ALTER TABLE "ClientSyncLog" ADD COLUMN "latestMetricDate" DATETIME;
ALTER TABLE "ClientSyncLog" ADD COLUMN "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ClientSyncLog" ADD COLUMN "completedAt" DATETIME;

-- CreateTable
CREATE TABLE "ClientMetaCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "objective" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientMetaCampaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientMetaAdset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientMetaAdset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientMetaAdset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ClientMetaCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientMetaAd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "metaId" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientMetaAd_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientMetaAd_adsetId_fkey" FOREIGN KEY ("adsetId") REFERENCES "ClientMetaAdset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientDailyMetaMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "level" TEXT NOT NULL,
    "subjectMetaId" TEXT NOT NULL,
    "campaignId" TEXT,
    "adsetId" TEXT,
    "adId" TEXT,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientDailyMetaMetric_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientDailyMetaMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ClientMetaCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientDailyMetaMetric_adsetId_fkey" FOREIGN KEY ("adsetId") REFERENCES "ClientMetaAdset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientDailyMetaMetric_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ClientMetaAd" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientMetaCampaign_clientId_metaId_key" ON "ClientMetaCampaign"("clientId", "metaId");
CREATE INDEX "ClientMetaCampaign_clientId_idx" ON "ClientMetaCampaign"("clientId");
CREATE UNIQUE INDEX "ClientMetaAdset_clientId_metaId_key" ON "ClientMetaAdset"("clientId", "metaId");
CREATE INDEX "ClientMetaAdset_clientId_idx" ON "ClientMetaAdset"("clientId");
CREATE INDEX "ClientMetaAdset_campaignId_idx" ON "ClientMetaAdset"("campaignId");
CREATE UNIQUE INDEX "ClientMetaAd_clientId_metaId_key" ON "ClientMetaAd"("clientId", "metaId");
CREATE INDEX "ClientMetaAd_clientId_idx" ON "ClientMetaAd"("clientId");
CREATE INDEX "ClientMetaAd_adsetId_idx" ON "ClientMetaAd"("adsetId");
CREATE UNIQUE INDEX "ClientDailyMetaMetric_clientId_date_level_subjectMetaId_key" ON "ClientDailyMetaMetric"("clientId", "date", "level", "subjectMetaId");
CREATE INDEX "ClientDailyMetaMetric_clientId_date_idx" ON "ClientDailyMetaMetric"("clientId", "date");
