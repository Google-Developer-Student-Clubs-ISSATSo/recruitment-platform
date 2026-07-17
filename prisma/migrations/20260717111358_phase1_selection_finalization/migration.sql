-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PhaseOneClassification" ADD VALUE 'MANUAL_ACCEPT';
ALTER TYPE "PhaseOneClassification" ADD VALUE 'MANUAL_REJECT';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "phaseOneFinalizedAt" TIMESTAMP(3);
