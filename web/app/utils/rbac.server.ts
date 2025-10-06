import { Role } from "@prisma/client";
import { redirect } from "@remix-run/node";
import { requireUser } from "./auth.server";

export function hasRole(user: { role: Role }, roles: Role | Role[]): boolean {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return allowed.includes(user.role);
}

export async function requireRole(request: Request, roles: Role | Role[], fallback = "/dashboard?unauthorized=1") {
  const user = await requireUser(request);
  if (!hasRole(user as any, roles)) {
    throw redirect(fallback);
  }
  return user;
}

export async function requireVerified(request: Request, fallback = "/dashboard/verify") {
  const user = await requireUser(request);
  if (!user.isVerified) {
    throw redirect(fallback);
  }
  return user;
}
