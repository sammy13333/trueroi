-- Keep prior generic lead data intact for auditability. Website Lead columns
-- are repopulated by the next Meta sync from the exact Website Lead action.
ALTER TABLE "ClientDailyMetaMetric" ADD COLUMN "websiteLeads" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClientDailyMetaMetric" ADD COLUMN "websiteLeadCostCents" INTEGER;
