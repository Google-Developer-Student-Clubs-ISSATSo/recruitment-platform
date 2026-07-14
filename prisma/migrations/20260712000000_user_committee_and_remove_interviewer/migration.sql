/*
  Warnings:

  - The values [INTERVIEWER] on the enum `RoleTemplateName` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `committee` on the `UserPermission` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,permission]` on the table `UserPermission` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `committee` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "RoleTemplateName_new" AS ENUM ('TM_REVIEWER', 'TECHNICAL_SCORER', 'COMMITTEE_REPRESENTATIVE', 'TM_LEAD');
ALTER TABLE "RoleTemplate" ALTER COLUMN "name" TYPE "RoleTemplateName_new" USING ("name"::text::"RoleTemplateName_new");
ALTER TYPE "RoleTemplateName" RENAME TO "RoleTemplateName_old";
ALTER TYPE "RoleTemplateName_new" RENAME TO "RoleTemplateName";
DROP TYPE "RoleTemplateName_old";
COMMIT;

-- DropIndex
DROP INDEX "UserPermission_userId_permission_committee_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "committee" "Committee" NOT NULL;

-- AlterTable
ALTER TABLE "UserPermission" DROP COLUMN "committee";

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permission_key" ON "UserPermission"("userId", "permission");
