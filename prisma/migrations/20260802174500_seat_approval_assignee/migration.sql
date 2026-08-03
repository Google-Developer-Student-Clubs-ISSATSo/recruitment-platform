-- Who would take the seat if a Club Lead's request is approved.
--
-- Nullable, and deliberately not backfilled: every row written before this
-- column existed was a Club Lead asking for a seat for themselves, which is
-- what a null means to the code that reads it ("the requester"). Backfilling
-- with requestedById would encode that same meaning twice and make a genuinely
-- old row indistinguishable from one that explicitly names its requester.
ALTER TABLE "PanelSeatApprovalRequest" ADD COLUMN "assigneeUserId" TEXT;

ALTER TABLE "PanelSeatApprovalRequest"
  ADD CONSTRAINT "PanelSeatApprovalRequest_assigneeUserId_fkey"
  FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
