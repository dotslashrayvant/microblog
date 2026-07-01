import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";

import { verifySession } from "../middleware/verify-session";

import {
  CreatePostSchema,
  PostIdParamSchema,
  PostListQuerySchema,
  ReplyBodySchema,
  UpdatePostSchema,
} from "./schema";

import {
  createPost,
  deletePost,
  getLikingUsers,
  getPostById,
  likePost,
  repostPost,
  unlikePost,
  unrepostPost,
  updatePost,
} from "./service";

export const posts = new Hono();

// Same 400 shape used by the auth/users routes.
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

// Create a post - top-level, or a reply when parentId is provided.
posts.post(
  "/",
  verifySession,
  zValidator("json", CreatePostSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await createPost(c.var.userId, c.req.valid("json"));
    if (!result.ok) {
      const error =
        result.code === 404 ? "Parent post not found" : "Failed to create post";
      return c.json({ error }, result.code);
    }

    return c.json({ post: result.post }, 201);
  },
);

// Public post detail.
posts.get(
  "/:id",
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await getPostById(c.req.valid("param").id);
    if (!result.ok) return c.json({ error: "Post not found" }, result.code);

    return c.json({ post: result.post });
  },
);

// Edit own post (content only).
posts.patch(
  "/:id",
  verifySession,
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  zValidator("json", UpdatePostSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await updatePost(
      c.req.valid("param").id,
      c.var.userId,
      c.req.valid("json"),
    );
    if (!result.ok) {
      const error = result.code === 403 ? "Forbidden" : "Post not found";
      return c.json({ error }, result.code);
    }

    return c.json({ post: result.post });
  },
);

// Delete own post.
posts.delete(
  "/:id",
  verifySession,
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await deletePost(c.req.valid("param").id, c.var.userId);
    if (!result.ok) {
      const error = result.code === 403 ? "Forbidden" : "Post not found";
      return c.json({ error }, result.code);
    }

    return c.json({ success: true });
  },
);

// Reply to a post - parentId comes from the path.
posts.post(
  "/:id/reply",
  verifySession,
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  zValidator("json", ReplyBodySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await createPost(c.var.userId, {
      content: c.req.valid("json").content,
      parentId: c.req.valid("param").id,
    });
    if (!result.ok) {
      const error =
        result.code === 404 ? "Parent post not found" : "Failed to create post";
      return c.json({ error }, result.code);
    }

    return c.json({ post: result.post }, 201);
  },
);

// Like a post (idempotent - repeating is a no-op).
posts.post(
  "/:id/like",
  verifySession,
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await likePost(c.var.userId, c.req.valid("param").id);
    if (!result.ok) return c.json({ error: "Post not found" }, result.code);

    return c.json({ success: true });
  },
);

// Remove a like (idempotent).
posts.delete(
  "/:id/like",
  verifySession,
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await unlikePost(c.var.userId, c.req.valid("param").id);
    if (!result.ok) return c.json({ error: "Post not found" }, result.code);

    return c.json({ success: true });
  },
);

// Repost a post (idempotent).
posts.post(
  "/:id/repost",
  verifySession,
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await repostPost(c.var.userId, c.req.valid("param").id);
    if (!result.ok) return c.json({ error: "Post not found" }, result.code);

    return c.json({ success: true });
  },
);

// Remove a repost (idempotent).
posts.delete(
  "/:id/repost",
  verifySession,
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await unrepostPost(c.var.userId, c.req.valid("param").id);
    if (!result.ok) return c.json({ error: "Post not found" }, result.code);

    return c.json({ success: true });
  },
);

// Public: users who liked a post, newest-like first.
posts.get(
  "/:id/liking_users",
  zValidator("param", PostIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await getLikingUsers(
      c.req.valid("param").id,
      c.req.valid("query"),
    );
    if (!result.ok) return c.json({ error: "Post not found" }, result.code);

    return c.json({ users: result.users });
  },
);
