/*
  Warnings:

  - Made the column `mode` on table `FormattedVersion` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."FormattedVersion" ALTER COLUMN "mode" SET NOT NULL;
