import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { COOKIE_NAME, cookieOptions } from "../config";
import { createSession, registerUser } from "./service";
import { UserRegisterSchema } from "./schema";
import { rateLimit } from "../middleware/rate-limit";

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

    if (!result.ok) {
      return c.json({ error: "Incorrect email or password" }, 409);
    }

    if (result.user) {
      const token = await createSession(result.user.id);
      setCookie(c, COOKIE_NAME, token, cookieOptions);
    }

    return c.json(
      {
        user: result.user,
        message: "Account created",
        action: "Check your email to verify your account",
      },

      201,
    );
  },
);

auth.post("/login", async (c) => {});
auth.post("/logout", async (c) => {});
auth.get("/me", async (c) => {});
