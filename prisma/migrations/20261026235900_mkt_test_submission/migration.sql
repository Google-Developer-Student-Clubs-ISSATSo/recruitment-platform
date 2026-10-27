-- CreateEnum
CREATE TYPE "MktTestKind" AS ENUM ('GRAPHIC_DESIGN', 'VIDEO_EDITING');

-- CreateTable
CREATE TABLE "MktTestSubmission" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "kind" "MktTestKind" NOT NULL,
    "link" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MktTestSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MktTestSubmission_applicantId_kind_key" ON "MktTestSubmission"("applicantId", "kind");

-- AddForeignKey
ALTER TABLE "MktTestSubmission" ADD CONSTRAINT "MktTestSubmission_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MktTestSubmission" ADD CONSTRAINT "MktTestSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
