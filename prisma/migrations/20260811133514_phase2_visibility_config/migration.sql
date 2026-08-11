-- CreateTable
CREATE TABLE "Phase2VisibilityConfig" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "notesClosedAt" TIMESTAMP(3),
    "notesClosedById" TEXT,
    "flagsClosedAt" TIMESTAMP(3),
    "flagsClosedById" TEXT,

    CONSTRAINT "Phase2VisibilityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Phase2VisibilityConfig_campaignId_key" ON "Phase2VisibilityConfig"("campaignId");

-- AddForeignKey
ALTER TABLE "Phase2VisibilityConfig" ADD CONSTRAINT "Phase2VisibilityConfig_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase2VisibilityConfig" ADD CONSTRAINT "Phase2VisibilityConfig_notesClosedById_fkey" FOREIGN KEY ("notesClosedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase2VisibilityConfig" ADD CONSTRAINT "Phase2VisibilityConfig_flagsClosedById_fkey" FOREIGN KEY ("flagsClosedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

