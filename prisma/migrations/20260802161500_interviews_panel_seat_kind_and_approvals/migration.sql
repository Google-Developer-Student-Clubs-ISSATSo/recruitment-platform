-- Interviews rework: PanelSeat.committee -> PanelSeat.kind, plus per-campaign
-- interview settings and the Club Lead seat-approval flow.
--
-- HAND-WRITTEN, not generated. `prisma migrate dev` refuses this change
-- non-interactively and its own plan would have added `kind` as a required
-- column with no default and dropped `committee` outright — destroying the
-- committee value on all 12 existing seat rows. The steps below add the new
-- column nullable, COPY every row's value across, assert nothing was missed,
-- and only then enforce NOT NULL and drop the old column.

-- CreateEnum
CREATE TYPE "PanelSeatKind" AS ENUM ('MKT', 'TM', 'EER', 'FLOATING');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- Add `kind` nullable so existing rows survive the ALTER; made NOT NULL below
-- once every row has been backfilled.
ALTER TABLE "PanelSeat" ADD COLUMN "kind" "PanelSeatKind";

-- Carry every existing seat's committee across. The three Committee values all
-- have an identically-named PanelSeatKind value (MKT->MKT, TM->TM, EER->EER),
-- so the mapping goes through text rather than needing a CASE per value.
-- FLOATING has no Committee counterpart and is deliberately never produced
-- here: no pre-existing seat can be a floating seat.
UPDATE "PanelSeat" SET "kind" = "committee"::text::"PanelSeatKind";

-- Fail the whole migration rather than silently losing a row's seat identity.
-- If any row were left NULL, the SET NOT NULL below would error anyway, but it
-- would do so without saying why — this names the problem.
DO $$
DECLARE
  unmapped INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped FROM "PanelSeat" WHERE "kind" IS NULL;
  IF unmapped > 0 THEN
    RAISE EXCEPTION
      'PanelSeat.kind backfill missed % row(s) — aborting rather than dropping their committee value.',
      unmapped;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "PanelSeat" ALTER COLUMN "kind" SET NOT NULL;

-- The old constraint must go before the column it covers.
-- DropIndex
DROP INDEX "PanelSeat_panelId_committee_key";

-- AlterTable
ALTER TABLE "PanelSeat" DROP COLUMN "committee";

-- CreateIndex
CREATE UNIQUE INDEX "PanelSeat_panelId_kind_key" ON "PanelSeat"("panelId", "kind");

-- CreateTable
CREATE TABLE "InterviewConfig" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "panelSize" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "InterviewConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewConfig_campaignId_key" ON "InterviewConfig"("campaignId");

-- AddForeignKey
ALTER TABLE "InterviewConfig" ADD CONSTRAINT "InterviewConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PanelSeatApprovalRequest" (
    "id" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "PanelSeatApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PanelSeatApprovalRequest" ADD CONSTRAINT "PanelSeatApprovalRequest_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "PanelSeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelSeatApprovalRequest" ADD CONSTRAINT "PanelSeatApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelSeatApprovalRequest" ADD CONSTRAINT "PanelSeatApprovalRequest_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
