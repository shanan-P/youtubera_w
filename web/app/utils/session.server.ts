import { createSessionStorage } from "@remix-run/node";
import { randomUUID } from "node:crypto";
import { redis } from "~/utils/redis.server";

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const PREFIX = "session:";

function ttlFromExpires(expires?: Date) {
  if (!expires) return undefined;
  const diff = expires.getTime() - Date.now();
  if (diff <= 0) return 1;
  return Math.ceil(diff / 1000);
}

export const sessionStorage = createSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [SESSION_SECRET],
    secure: process.env.NODE_ENV === "production"
  },
  async createData(data, expires) {
    const id = randomUUID();
    const key = PREFIX + id;
    const ttl = ttlFromExpires(expires);
    const value = JSON.stringify(data);
    if (ttl) await redis.set(key, value, "EX", ttl);
    else await redis.set(key, value);
    return id;
  },
  async readData(id) {
    const raw = await redis.get(PREFIX + id);
    return raw ? (JSON.parse(raw) as any) : null;
  },
  async updateData(id, data, expires) {
    const key = PREFIX + id;
    const ttl = ttlFromExpires(expires);
    const value = JSON.stringify(data);
    if (ttl) await redis.set(key, value, "EX", ttl);
    else await redis.set(key, value);
  },
  async deleteData(id) {
    await redis.del(PREFIX + id);
  }
});

export const { getSession, commitSession, destroySession } = sessionStorage;
