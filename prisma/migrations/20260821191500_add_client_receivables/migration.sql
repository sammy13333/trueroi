CREATE TYPE "ClientReceivableType" AS ENUM ('RETAINER', 'SETUP_FEE', 'REV_SHARE', 'OTHER');
CREATE TYPE "ClientReceivableStatus" AS ENUM ('OWED', 'PAID');

CREATE TABLE "ClientReceivable" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "customerName" TEXT NOT NULL,
    "type" "ClientReceivableType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ClientReceivableStatus" NOT NULL DEFAULT 'OWED',
    "paidDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientReceivable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientReceivable_clientId_idx" ON "ClientReceivable"("clientId");
CREATE INDEX "ClientReceivable_dueDate_idx" ON "ClientReceivable"("dueDate");
CREATE INDEX "ClientReceivable_status_idx" ON "ClientReceivable"("status");

ALTER TABLE "ClientReceivable" ADD CONSTRAINT "ClientReceivable_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
