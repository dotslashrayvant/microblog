import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";

import { rateLimit } from "../middleware/rate-limit";
import { COOKIE_NAME, cookieOptions } from "../config";
import { UserLoginSchema, UserRegisterSchema } from "./schema";

import {
  createSession,
  destroySession,
  loginUser,
  registerUser,
} from "./service";

export const auth = new Hono();

auth.post(
  "/register",
  rateLimit,

  zValidator("json", UserRegisterSchema, (res, c) => {
    if (!res.success)
      return c.json(
        {
          error: res.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
  }),

  async (c) => {
    const result = await registerUser(c.req.valid("json"));

    if (!result.ok || !result.user) {
      return c.json({ error: "Registration failed" }, result.code);
    }

    const token = await createSession(result.user.id);
    setCookie(c, COOKIE_NAME, token, cookieOptions);

    return c.json({ success: true }, 201);
  },
);

auth.post(
  "/login",
  rateLimit,

  zValidator("json", UserLoginSchema, (res, c) => {
    if (!res.success)
      return c.json(
        {
          error: res.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
  }),

  async (c) => {
    const result = await loginUser(c.req.valid("json"));
    if (!result.ok || !result.userId) {
      return c.json({ error: "Incorrect email or password" }, 401);
    }

    const token = await createSession(result.userId);
    setCookie(c, COOKIE_NAME, token, cookieOptions);

    return c.json({ success: true });
  },
);

auth.post("/logout", async (c) => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (sessionId) await destroySession(sessionId);

  deleteCookie(c, COOKIE_NAME, cookieOptions);
  return c.json({ success: true });
});
