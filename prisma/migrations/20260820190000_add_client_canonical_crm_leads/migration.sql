ALTER TABLE "ClientPipeline" ADD COLUMN "bookedStageIdsJson" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "ClientGhlContact"
  ADD COLUMN "attributionSource" TEXT,
  ADD COLUMN "utmSource" TEXT,
  ADD COLUMN "utmMedium" TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "utmContent" TEXT,
  ADD COLUMN "utmTerm" TEXT,
  ADD COLUMN "campaignMetaId" TEXT,
  ADD COLUMN "adsetMetaId" TEXT,
  ADD COLUMN "adMetaId" TEXT;

CREATE INDEX "ClientGhlContact_clientId_sourceCreatedAt_idx"
  ON "ClientGhlContact"("clientId", "sourceCreatedAt");

CREATE TABLE "ClientCrmLead" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "ghlContactId" TEXT NOT NULL,
  "ghlOpportunityId" TEXT,
  "pipelineGhlId" TEXT,
  "pipelineStageGhlId" TEXT,
  "pipelineStageName" TEXT,
  "attributionSource" TEXT,
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmContent" TEXT,
  "utmTerm" TEXT,
  "campaignMetaId" TEXT,
  "adsetMetaId" TEXT,
  "adMetaId" TEXT,
  "matchedCampaignId" TEXT,
  "matchedAdsetId" TEXT,
  "matchedAdId" TEXT,
  "attributionMethod" TEXT,
  "unmatchedReason" TEXT,
  "booked" BOOLEAN NOT NULL DEFAULT false,
  "bookedAt" TIMESTAMP(3),
  "leadCreatedAt" TIMESTAMP(3),
  "attributionEvidenceJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientCrmLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientCrmLead_contactId_key" ON "ClientCrmLead"("contactId");
CREATE UNIQUE INDEX "ClientCrmLead_clientId_ghlContactId_key" ON "ClientCrmLead"("clientId", "ghlContactId");
CREATE INDEX "ClientCrmLead_clientId_leadCreatedAt_idx" ON "ClientCrmLead"("clientId", "leadCreatedAt");
CREATE INDEX "ClientCrmLead_clientId_matchedCampaignId_idx" ON "ClientCrmLead"("clientId", "matchedCampaignId");
CREATE INDEX "ClientCrmLead_clientId_matchedAdsetId_idx" ON "ClientCrmLead"("clientId", "matchedAdsetId");
CREATE INDEX "ClientCrmLead_clientId_matchedAdId_idx" ON "ClientCrmLead"("clientId", "matchedAdId");

ALTER TABLE "ClientCrmLead"
  ADD CONSTRAINT "ClientCrmLead_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientCrmLead"
  ADD CONSTRAINT "ClientCrmLead_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ClientGhlContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
