-- CreateTable
CREATE TABLE "AgencyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'My Agency',
    "metaAdAccountId" TEXT,
    "metaAccessTokenEnc" TEXT,
    "ghlLocationId" TEXT,
    "ghlApiTokenEnc" TEXT,
    "pipelineMappings" TEXT NOT NULL DEFAULT '[]',
    "stageTagMappings" TEXT NOT NULL DEFAULT '{}',
    "syncWindowStart" DATETIME,
    "syncWindowEnd" DATETIME,
    "defaultDateBasis" TEXT NOT NULL DEFAULT 'lead_created',
    "defaultRevSharePct" REAL NOT NULL DEFAULT 7.5,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgencyMetaCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "objective" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "classification" TEXT NOT NULL DEFAULT 'AGENCY_ACQUISITION',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgencyMetaAdset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metaId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgencyMetaAdset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgencyMetaCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgencyMetaAd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "metaId" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgencyMetaAd_adsetId_fkey" FOREIGN KEY ("adsetId") REFERENCES "AgencyMetaAdset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgencyDailyAdMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "level" TEXT NOT NULL,
    "campaignId" TEXT,
    "adsetId" TEXT,
    "adId" TEXT,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leadForms" INTEGER NOT NULL DEFAULT 0,
    "webSchedules" INTEGER NOT NULL DEFAULT 0,
    "webLeads" INTEGER NOT NULL DEFAULT 0,
    "otherResults" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AgencyDailyAdMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AgencyMetaCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgencyDailyAdMetric_adsetId_fkey" FOREIGN KEY ("adsetId") REFERENCES "AgencyMetaAdset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgencyDailyAdMetric_adId_fkey" FOREIGN KEY ("adId") REFERENCES "AgencyMetaAd" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgencyLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ghlContactId" TEXT,
    "campaignMetaId" TEXT,
    "adsetMetaId" TEXT,
    "adMetaId" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'LEAD',
    "dealType" TEXT,
    "attributedValueCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcomeAt" DATETIME,
    "attributionMethod" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgencySyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "mode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "latestMetricDate" DATETIME,
    "details" TEXT
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "processor" TEXT NOT NULL,
    "externalId" TEXT,
    "normalizedType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "grossDollars" REAL,
    "netDollars" REAL,
    "processorCreatedAt" DATETIME,
    "paidAt" DATETIME,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "duplicate" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "AgencyExpenseLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyMetaCampaign_metaId_key" ON "AgencyMetaCampaign"("metaId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyMetaAdset_metaId_key" ON "AgencyMetaAdset"("metaId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyMetaAd_metaId_key" ON "AgencyMetaAd"("metaId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyDailyAdMetric_date_level_campaignId_adsetId_adId_key" ON "AgencyDailyAdMetric"("date", "level", "campaignId", "adsetId", "adId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyLead_ghlContactId_key" ON "AgencyLead"("ghlContactId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_processor_externalId_key" ON "PaymentTransaction"("processor", "externalId");
