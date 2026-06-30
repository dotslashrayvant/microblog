import { redis } from "bun";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { profiles, sessions, users } from "../db/schema";
import { SESSION_TTL_SECONDS, VERIFICATION_TTL_SECONDS } from "../config";
import type { UserRegisterData } from "./schema";

export async function createSession(userId: string) {
  const sessionId = crypto.randomUUID();
  const key = `session:${sessionId}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db.insert(sessions).values({ id: sessionId, userId, expiresAt });
  await redis.set(key, userId);
  await redis.expire(key, SESSION_TTL_SECONDS);

  return sessionId;
}

// TODO: wire up kafka for email sending service
async function sendVerificationEmail(email: string) {
  console.log(`email verification event: ${email}`);
}

export async function registerUser(input: UserRegisterData) {
  // check if user exists
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email));

  if (existing) return { ok: false, reason: "user already exists" };

  // create a new user
  let user: { id: string; email: string };
  const passwordHash = await Bun.password.hash(input.password);

  try {
    user = await db.transaction(async (tx) => {
      // create a user on db
      const [created] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash })
        .returning({ id: users.id, email: users.email });

      if (!created) throw new Error("User insert returned no row");

      // create a user's profile on db
      await tx.insert(profiles).values({
        userId: created.id,
        handle: input.handle,
        displayName: input.displayName,
      });

      return created;
    });
  } catch {
    return { ok: false, reason: "db error" };
  }

  await sendVerificationEmail(user.email);

  return { ok: true, user };
}
