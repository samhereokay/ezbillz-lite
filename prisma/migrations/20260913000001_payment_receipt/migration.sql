-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCESS', 'VOID');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "receiptNextSeq" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "receiptPrefix" TEXT NOT NULL DEFAULT 'RCP';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receiptNumber" TEXT,
ADD COLUMN     "sequence" INTEGER,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCESS';

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_sequence_key" ON "Payment"("organizationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_receiptNumber_key" ON "Payment"("organizationId", "receiptNumber");
