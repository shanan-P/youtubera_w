-- CreateTable
CREATE TABLE "public"."VideoMarker" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "thumbnailUrl" TEXT,

    CONSTRAINT "VideoMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoMarker_courseId_idx" ON "public"."VideoMarker"("courseId");

-- AddForeignKey
ALTER TABLE "public"."VideoMarker" ADD CONSTRAINT "VideoMarker_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
