-- CreateEnum
CREATE TYPE "PhaseOneClassification" AS ENUM ('PENDING', 'AUTO_ACCEPT', 'AUTO_REJECT', 'TO_DISCUSS');

-- CreateTable
CREATE TABLE "PhaseOneQuestion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "coefficient" DOUBLE PRECISION NOT NULL,
    "noteScale" DOUBLE PRECISION[],
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresTechnicalScorer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PhaseOneQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseOneScore" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "scoredById" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhaseOneScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseOneResult" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "weightedTotal" DOUBLE PRECISION,
    "rank" INTEGER,
    "classification" "PhaseOneClassification" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseOneResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseOneConfig" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "rejectThreshold" DOUBLE PRECISION,
    "targetCount" INTEGER,

    CONSTRAINT "PhaseOneConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhaseOneQuestion_campaignId_order_key" ON "PhaseOneQuestion"("campaignId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseOneScore_applicantId_questionId_key" ON "PhaseOneScore"("applicantId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseOneResult_applicantId_key" ON "PhaseOneResult"("applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseOneConfig_campaignId_key" ON "PhaseOneConfig"("campaignId");

-- AddForeignKey
ALTER TABLE "PhaseOneQuestion" ADD CONSTRAINT "PhaseOneQuestion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseOneScore" ADD CONSTRAINT "PhaseOneScore_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseOneScore" ADD CONSTRAINT "PhaseOneScore_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PhaseOneQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseOneScore" ADD CONSTRAINT "PhaseOneScore_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseOneResult" ADD CONSTRAINT "PhaseOneResult_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseOneConfig" ADD CONSTRAINT "PhaseOneConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
