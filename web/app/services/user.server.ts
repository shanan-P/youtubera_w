import { prisma } from "~/utils/db.server";
import type { Role, User } from "~/types/models";

export type CreateUserInput = {
  username: string;
  email: string;
  passwordHash?: string;
  role?: Role;
  isVerified?: boolean;
  profilePicture?: string | null;
  bio?: string | null;
};

export async function createUser(data: CreateUserInput): Promise<User> {
  return prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role ?? "learner",
      isVerified: data.isVerified ?? false,
      profilePicture: data.profilePicture ?? null,
      bio: data.bio ?? null
    }
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "desc" } });
}

export type UpdateUserInput = Partial<Pick<User, "username" | "email" | "passwordHash" | "role" | "isVerified" | "profilePicture" | "bio" | "isProfilePublic" >>;

export async function updateUser(id: string, data: UpdateUserInput) {
  return prisma.user.update({ where: { id }, data });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({ where: { id } });
}
