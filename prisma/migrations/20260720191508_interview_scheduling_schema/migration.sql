-- CreateTable
CREATE TABLE "InterviewSlot" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "scheduledTime" TIMESTAMP(3),
    "room" TEXT,
    "enteredById" TEXT,
    "enteredAt" TIMESTAMP(3),

    CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPanel" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,

    CONSTRAINT "InterviewPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelSeat" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "committee" "Committee" NOT NULL,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "PanelSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewNote" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "personality" DOUBLE PRECISION,
    "communication" DOUBLE PRECISION,
    "motivation" DOUBLE PRECISION,
    "creativity" DOUBLE PRECISION,
    "problemSolving" DOUBLE PRECISION,
    "stressManagement" DOUBLE PRECISION,
    "teamWork" DOUBLE PRECISION,
    "remarks" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSlot_applicantId_key" ON "InterviewSlot"("applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewPanel_applicantId_key" ON "InterviewPanel"("applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelSeat_panelId_committee_key" ON "PanelSeat"("panelId", "committee");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewNote_applicantId_key" ON "InterviewNote"("applicantId");

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPanel" ADD CONSTRAINT "InterviewPanel_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelSeat" ADD CONSTRAINT "PanelSeat_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "InterviewPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelSeat" ADD CONSTRAINT "PanelSeat_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewNote" ADD CONSTRAINT "InterviewNote_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
