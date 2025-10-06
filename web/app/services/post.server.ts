import { prisma } from "~/utils/db.server";
import type { Post } from "~/types/models";

export type CreatePostInput = {
  userId: string;
  courseId: string;
  content: string;
  isModerated?: boolean;
};

export async function createPost(data: CreatePostInput): Promise<Post> {
  return prisma.post.create({
    data: {
      userId: data.userId,
      courseId: data.courseId,
      content: data.content,
      isModerated: data.isModerated ?? false
    }
  });
}

export async function getPostById(id: string) {
  return prisma.post.findUnique({ where: { id } });
}

export async function listPostsByCourse(courseId: string) {
  return prisma.post.findMany({ where: { courseId }, orderBy: { createdAt: "desc" } });
}

export async function listPostsByUser(userId: string) {
  return prisma.post.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function moderatePost(id: string, isModerated: boolean) {
  return prisma.post.update({ where: { id }, data: { isModerated } });
}

export async function deletePost(id: string) {
  return prisma.post.delete({ where: { id } });
}
