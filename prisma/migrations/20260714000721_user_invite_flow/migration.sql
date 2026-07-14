-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "committee" "Committee" NOT NULL,
    "roleTemplateId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_token_key" ON "UserInvite"("token");

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_roleTemplateId_fkey" FOREIGN KEY ("roleTemplateId") REFERENCES "RoleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
