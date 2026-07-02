import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";

import { verifySession } from "../middleware/verify-session";

import { PostListQuerySchema } from "../posts/schema";
import { getHomeFeed } from "../posts/service";

export const feed = new Hono();

// Same 400 shape used by the auth/users/posts routes.
function badRequest(
  c: Context,
  issues: { path: PropertyKey[]; message: string }[],
) {
  return c.json(
    {
      error: issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    },
    400,
  );
}

// Home timeline: posts from followed users plus the user's own, newest first.
feed.get(
  "/",
  verifySession,

  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  async (c) => {
    const result = await getHomeFeed(c.var.userId, c.req.valid("query"));
    return c.json({ posts: result.posts });
  },
);
