-- CreateTable
CREATE TABLE "CommitteeCapacity" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "committee" "Committee" NOT NULL,
    "target" INTEGER NOT NULL,

    CONSTRAINT "CommitteeCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommitteeCapacity_campaignId_committee_key" ON "CommitteeCapacity"("campaignId", "committee");

-- AddForeignKey
ALTER TABLE "CommitteeCapacity" ADD CONSTRAINT "CommitteeCapacity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
