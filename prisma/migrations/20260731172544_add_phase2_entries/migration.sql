-- CreateEnum
CREATE TYPE "Phase2EntryType" AS ENUM ('NOTE', 'RED_FLAG', 'GREEN_FLAG');

-- CreateTable
CREATE TABLE "Phase2Entry" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "type" "Phase2EntryType" NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Phase2Entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Phase2Entry_applicantId_createdAt_idx" ON "Phase2Entry"("applicantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Phase2Entry" ADD CONSTRAINT "Phase2Entry_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase2Entry" ADD CONSTRAINT "Phase2Entry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
