/*
  Warnings:

  - You are about to drop the `UserInvite` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_invitedBy_fkey";

-- DropForeignKey
ALTER TABLE "UserInvite" DROP CONSTRAINT "UserInvite_roleTemplateId_fkey";

-- DropTable
DROP TABLE "UserInvite";
