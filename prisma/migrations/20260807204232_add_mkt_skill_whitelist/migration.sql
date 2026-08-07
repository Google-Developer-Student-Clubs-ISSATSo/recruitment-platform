-- CreateTable
CREATE TABLE "MktSkillWhitelist" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MktSkillWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MktSkillWhitelist_campaignId_skillName_key" ON "MktSkillWhitelist"("campaignId", "skillName");

-- AddForeignKey
ALTER TABLE "MktSkillWhitelist" ADD CONSTRAINT "MktSkillWhitelist_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
