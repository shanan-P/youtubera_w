import bcrypt from "bcryptjs";
import { redirect } from "@remix-run/node";
import { prisma } from "~/utils/db.server";
import { getSession, commitSession, destroySession } from "~/utils/session.server";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
};

export async function register({ username, email, password }: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true }
  });
  if (existing) {
    throw new Error("User with this email or username already exists");
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username, email, passwordHash }
  });
  return user;
}

export type LoginInput = {
  identifier: string; // email or username
  password: string;
};

export async function login({ identifier, password }: LoginInput) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier }]
    }
  });
  if (!user || !user.passwordHash) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return user;
}

export async function createUserSession(userId: string, redirectTo = "/") {
  const session = await getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await commitSession(session) }
  });
}

export async function getUserId(request: Request) {
  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);
  const userId = session.get("userId");
  return typeof userId === "string" ? userId : null;
}

export async function getUser(request: Request) {
  const userId = await getUserId(request);
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, role: true, bio: true, profilePicture: true, isVerified: true, phone: true }
  });
  if (!user) {
    throw await logout(request);
  }
  return user;
}

export async function requireUserId(request: Request) {
  const userId = await getUserId(request);
  if (!userId) throw redirect("/login");
  return userId;
}

export async function requireUser(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, role: true, bio: true, profilePicture: true, isVerified: true, phone: true }
  });
  if (!user) throw redirect("/login");
  return user;
}

export async function logout(request: Request) {
  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);
  return redirect("/", { headers: { "Set-Cookie": await destroySession(session) } });
}
