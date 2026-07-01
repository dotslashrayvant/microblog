import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";

import { verifySession } from "../middleware/verify-session";
import {
  CreatePostSchema,
  PostIdParamSchema,
  ReplyBodySchema,
  UpdatePostSchema,
} from "./schema";
import { createPost, deletePost, getPostById, updatePost } from "./service";

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

// Create a post — top-level, or a reply when parentId is provided.
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

// Reply to a post — parentId comes from the path.
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
