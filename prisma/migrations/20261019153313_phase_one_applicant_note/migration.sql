-- CreateTable
CREATE TABLE "PhaseOneNote" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseOneNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhaseOneNote_applicantId_key" ON "PhaseOneNote"("applicantId");

-- AddForeignKey
ALTER TABLE "PhaseOneNote" ADD CONSTRAINT "PhaseOneNote_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseOneNote" ADD CONSTRAINT "PhaseOneNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
