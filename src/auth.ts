import { redis } from "bun";
import { Hono } from "hono";
import z from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "./db";
import { profiles, sessions, users } from "./db/schema";
import { eq } from "drizzle-orm";
import { setCookie } from "hono/cookie";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const VERIFICATION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const RATE_LIMIT_SECONDS = 60 * 30; // 30 minutes
const RATE_LIMIT_ACC_CREATION = 5; // 5 accounts
const COOKIE_NAME = "session";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // HTTPS only in prod
  sameSite: "Lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export const auth = new Hono();

const registerSchema = z.object({
  email: z.email(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),

  handle: z
    .string()
    .min(3)
    .max(32)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Handle may only contain letters, numbers, and underscores",
    ),

  displayName: z.string().min(1).max(64),
});

/** Cryptographically random, URL-safe session token. */
function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** Create a session in Postgres (durable) + Redis (fast lookups). */
async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db.insert(sessions).values({ id: token, userId, expiresAt });
  await redis.set(`session:${token}`, userId);
  await redis.expire(`session:${token}`, SESSION_TTL_SECONDS);

  return token;
}

/** Create a verification token mapped to a userId in Redis. */
async function createVerificationToken(userId: string): Promise<string> {
  const token = generateSessionToken(); // reuse the same CSPRNG helper

  await redis.set(`verify:${token}`, userId);
  await redis.expire(`verify:${token}`, VERIFICATION_TTL_SECONDS);

  return token;
}

/**
 * Stand-in for a real email send. In a portfolio project, logging the link is
 * fine and lets a grader click through. Swap for Resend / SES / Postmark later.
 */
async function sendVerificationEmail(email: string, token: string) {
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/auth/verify-email?token=${token}`;
  console.log(`[email] Verification link for ${email}: ${link}`);
}

/* returns true if the request is ALLOWED, false if the limit is exceeded. */
async function checkRateLimit(key: string): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);

  if (count === 1) {
    await redis.expire(redisKey, RATE_LIMIT_SECONDS);
  }

  return count <= RATE_LIMIT_ACC_CREATION;
}

/** Hono middleware factory: limits by client IP. */
function rateLimitByIp() {
  return async (c: any, next: () => Promise<void>) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

    const route = new URL(c.req.url).pathname;
    const allowed = await checkRateLimit(`${route}:${ip}`);

    if (!allowed) {
      return c.json(
        { error: "Too many requests. Please try again later." },
        429,
      );
    }

    await next();
  };
}

auth.post(
  "/register",
  rateLimitByIp(),
  zValidator("json", registerSchema),
  async (c) => {
    const { email, password, handle, displayName } = c.req.valid("json");

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (existing) return c.json({ error: "Invalid email or password" }, 409);

    const passwordHash = await Bun.password.hash(password);

    let user: { id: string; email: string };
    try {
      user = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({ email, passwordHash })
          .returning({ id: users.id, email: users.email });

        if (!created) throw new Error("User insert returned no row");

        await tx
          .insert(profiles)
          .values({ userId: created.id, handle, displayName });

        return created;
      });
    } catch (err) {
      // Most likely a unique-constraint violation on handle (or email, on race).
      return c.json({ error: "Email or handle already in use" }, 409);
    }

    const verifyToken = await createVerificationToken(user.id);
    await sendVerificationEmail(user.email, verifyToken);

    const token = await createSession(user.id);
    setCookie(c, COOKIE_NAME, token, cookieOptions);

    return c.json(
      { user, message: "Check your email to verify your account" },
      201,
    );
  },
);

auth.post("/login", async (c) => {});

auth.post("/logout", async (c) => {});

auth.get("/me", async (c) => {});
