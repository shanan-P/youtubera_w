-- AlterEnum
ALTER TYPE "public"."ChapterContentType" ADD VALUE 'audio';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."ContentType" ADD VALUE 'youtube_text';
ALTER TYPE "public"."ContentType" ADD VALUE 'audiobook';
ALTER TYPE "public"."ContentType" ADD VALUE 'audiobook_text';

-- DropIndex
DROP INDEX "public"."course_search_idx";

-- CreateTable
CREATE TABLE "public"."FormattedVersion" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormattedVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormattedVersion_courseId_version_key" ON "public"."FormattedVersion"("courseId", "version");

-- AddForeignKey
ALTER TABLE "public"."FormattedVersion" ADD CONSTRAINT "FormattedVersion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
