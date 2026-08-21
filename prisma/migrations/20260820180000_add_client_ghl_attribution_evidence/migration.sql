ALTER TABLE "ClientGhlContact" ADD COLUMN "attributionEvidenceJson" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "ClientGhlOpportunity" ADD COLUMN "attributionEvidenceJson" TEXT NOT NULL DEFAULT '[]';
