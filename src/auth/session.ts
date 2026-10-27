import { redis } from "bun";
import { SESSION_TTL_SECONDS } from "@/config";

export async function createSession(userId: string) {
  const sessionId = crypto.randomUUID();
  const key = `session:${sessionId}`;

  await redis.set(key, userId);
  await redis.expire(key, SESSION_TTL_SECONDS);

  return sessionId;
}

export async function getSession(sessionId: string) {
  const key = `session:${sessionId}`;

  const exists = await redis.exists(key);
  if (!exists) return null;

  const userId = await redis.get(key);

  return userId;
}

export async function destroySession(sessionId: string) {
  await redis.del(`session:${sessionId}`);
}
