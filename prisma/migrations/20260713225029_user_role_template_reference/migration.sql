-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roleTemplateId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleTemplateId_fkey" FOREIGN KEY ("roleTemplateId") REFERENCES "RoleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
