ALTER TABLE "ClientGhlContact" ADD COLUMN "tagsJson" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "ClientGhlOpportunity" ADD COLUMN "campaignMetaId" TEXT;
ALTER TABLE "ClientGhlOpportunity" ADD COLUMN "adsetMetaId" TEXT;
ALTER TABLE "ClientGhlOpportunity" ADD COLUMN "adMetaId" TEXT;
ALTER TABLE "ClientGhlOpportunity" ADD COLUMN "tagsJson" TEXT NOT NULL DEFAULT '[]';

CREATE INDEX "ClientGhlOpportunity_clientId_campaignMetaId_idx" ON "ClientGhlOpportunity"("clientId", "campaignMetaId");
CREATE INDEX "ClientGhlOpportunity_clientId_adsetMetaId_idx" ON "ClientGhlOpportunity"("clientId", "adsetMetaId");
CREATE INDEX "ClientGhlOpportunity_clientId_adMetaId_idx" ON "ClientGhlOpportunity"("clientId", "adMetaId");
