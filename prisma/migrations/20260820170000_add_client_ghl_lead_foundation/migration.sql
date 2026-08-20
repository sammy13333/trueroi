-- CreateTable
CREATE TABLE "ClientGhlContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sourceCreatedAt" DATETIME,
    "sourceUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientGhlContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientGhlOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "ghlId" TEXT NOT NULL,
    "contactId" TEXT,
    "pipelineId" TEXT,
    "pipelineStageGhlId" TEXT,
    "pipelineStageName" TEXT,
    "name" TEXT,
    "status" TEXT,
    "monetaryValueCents" INTEGER,
    "sourceCreatedAt" DATETIME,
    "sourceUpdatedAt" DATETIME,
    "lastStatusChangeAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientGhlOpportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientGhlOpportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientGhlContact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClientGhlOpportunity_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "ClientPipeline" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientGhlContact_clientId_ghlId_key" ON "ClientGhlContact"("clientId", "ghlId");
CREATE INDEX "ClientGhlContact_clientId_idx" ON "ClientGhlContact"("clientId");
CREATE UNIQUE INDEX "ClientGhlOpportunity_clientId_ghlId_key" ON "ClientGhlOpportunity"("clientId", "ghlId");
CREATE INDEX "ClientGhlOpportunity_clientId_pipelineId_idx" ON "ClientGhlOpportunity"("clientId", "pipelineId");
CREATE INDEX "ClientGhlOpportunity_clientId_contactId_idx" ON "ClientGhlOpportunity"("clientId", "contactId");
CREATE INDEX "ClientGhlOpportunity_clientId_status_idx" ON "ClientGhlOpportunity"("clientId", "status");
