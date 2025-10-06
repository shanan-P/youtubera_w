import Redis from "ioredis";

// Singleton Redis client (avoids multiple connections in dev)
declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis: Redis = globalThis.__redis ?? new Redis(REDIS_URL);

if (process.env.NODE_ENV !== "production") {
  globalThis.__redis = redis;
}

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  const val = await redis.get(key);
  if (!val) return null;
  try {
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSeconds?: number) {
  const data = JSON.stringify(value);
  if (ttlSeconds && ttlSeconds > 0) {
    await redis.set(key, data, "EX", ttlSeconds);
  } else {
    await redis.set(key, data);
  }
}

export async function delCache(key: string) {
  await redis.del(key);
}
