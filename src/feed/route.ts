import { Hono } from "hono";

import { getHomeFeed } from "@/posts/service";
import { PostListQuerySchema } from "@/posts/schema";
import { validate } from "@/middleware/validate";
import { verifySession } from "@/middleware/verify-session";

export const feed = new Hono();

const validateListQuery = validate("query", PostListQuerySchema);

// Home timeline: posts from followed users plus the user's own, newest first.
feed.get("/", verifySession, validateListQuery, async (c) => {
  const result = await getHomeFeed(c.var.userId, c.req.valid("query"));
  return c.json({ posts: result.posts });
});
