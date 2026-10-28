import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";

import { COOKIE_NAME, cookieOptions } from "@/config";
import { rateLimit } from "@/middleware/rate-limit";
import { validate } from "@/middleware/validate";
import { LoginSchema, RegisterSchema } from "./schema";
import { loginUser, registerUser } from "./service";
import { createSession, destroySession } from "./session";

export const auth = new Hono();

const validateSignup = validate("json", RegisterSchema);
const validateLogin = validate("json", LoginSchema);

auth.post("/signup", rateLimit, validateSignup, async (c) => {
  const result = await registerUser(c.req.valid("json"));

  if (!result.ok || !result.user) {
    return c.json({ error: "Registration failed" }, result.code);
  }

  const token = await createSession(result.user.id);
  setCookie(c, COOKIE_NAME, token, cookieOptions);
  c.header("Cache-Control", "no-store");

  return c.json({ success: true }, 201);
});

auth.post("/login", rateLimit, validateLogin, async (c) => {
  const result = await loginUser(c.req.valid("json"));

  if (!result.ok || !result.userId) {
    return c.json({ error: "Incorrect email or password" }, 401);
  }

  const token = await createSession(result.userId);
  setCookie(c, COOKIE_NAME, token, cookieOptions);
  c.header("Cache-Control", "no-store");

  return c.json({ success: true });
});

auth.post("/logout", async (c) => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (sessionId) await destroySession(sessionId);

  deleteCookie(c, COOKIE_NAME, cookieOptions);
  return c.json({ success: true });
});
