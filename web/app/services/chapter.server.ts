import { prisma } from "~/utils/db.server";
import type {
  Chapter,
  ShortVideo,
  TextSection,
  ChapterContentType,
  ProcessingType
} from "~/types/models";

export type CreateChapterInput = {
  courseId: string;
  title: string;
  contentType: ChapterContentType;
  originalContentId?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  orderIndex?: number | null;
};

export async function createChapter(data: CreateChapterInput): Promise<Chapter> {
  return prisma.chapter.create({ data });
}

export async function getChapterById(id: string) {
  return prisma.chapter.findUnique({
    where: { id },
    include: { shortVideos: true, textSections: true }
  });
}

export async function listChaptersByCourse(courseId: string) {
  return prisma.chapter.findMany({ where: { courseId }, orderBy: { orderIndex: "asc" } });
}

export type UpdateChapterInput = Partial<Omit<CreateChapterInput, "courseId" | "contentType" | "title">> & {
  title?: string;
  contentType?: ChapterContentType;
};

export async function updateChapter(id: string, data: UpdateChapterInput) {
  return prisma.chapter.update({ where: { id }, data });
}

export async function deleteChapter(id: string) {
  return prisma.chapter.delete({ where: { id } });
}

// ShortVideo helpers
export type CreateShortVideoInput = {
  chapterId: string;
  title: string;
  videoUrl: string;
  duration?: number | null;
  downloadUrl?: string | null;
  thumbnailUrl?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  processingType?: ProcessingType | null;
  customQuery?: string | null;
  relevanceScore?: number | null;
  orderIndex?: number | null;
};

export async function createShortVideo(data: CreateShortVideoInput): Promise<ShortVideo> {
  return prisma.shortVideo.create({ data });
}

export async function listShortVideos(chapterId: string) {
  return prisma.shortVideo.findMany({ where: { chapterId }, orderBy: { orderIndex: "asc" } });
}

// TextSection helpers
export type CreateTextSectionInput = {
  chapterId: string;
  title: string;
  content: string;
  pageNumbers: number[];
  processingType?: ProcessingType;
  orderIndex?: number | null;
};

export async function createTextSection(data: CreateTextSectionInput): Promise<TextSection> {
  return prisma.textSection.create({ data: { ...data, processingType: data.processingType ?? "ai" } });
}

export async function listTextSections(chapterId: string) {
  return prisma.textSection.findMany({ where: { chapterId }, orderBy: { orderIndex: "asc" } });
}
