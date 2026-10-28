import { Hono } from "hono";

import { validate } from "@/middleware/validate";
import { verifySession } from "@/middleware/verify-session";
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

const validateCreatePost = validate("json", CreatePostSchema);
// Path params (`:id`) come from the URL, not the JSON body.
const validatePostParam = validate("param", PostIdParamSchema);
const validateUpdatePost = validate("json", UpdatePostSchema);
const validateReplyBody = validate("json", ReplyBodySchema);
const validateListQuery = validate("query", PostListQuerySchema);

// Top-level or a reply when parentId is provided.
posts.post("/", verifySession, validateCreatePost, async (c) => {
  const result = await createPost(c.var.userId, c.req.valid("json"));

  if (!result.ok) {
    const error =
      result.code === 404 ? "Parent post not found" : "Failed to create post";

    return c.json({ error }, result.code);
  }

  return c.json({ post: result.post }, 201);
});

// Public post detail.
posts.get("/:id", validatePostParam, async (c) => {
  const result = await getPostById(c.req.valid("param").id);

  if (!result.ok) return c.json({ error: "Post not found" }, result.code);

  return c.json({ post: result.post });
});

// Edit own post (content only).
posts.patch(
  "/:id",
  verifySession,
  validatePostParam,
  validateUpdatePost,

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
posts.delete("/:id", verifySession, validatePostParam, async (c) => {
  const result = await deletePost(c.req.valid("param").id, c.var.userId);

  if (!result.ok) {
    const error = result.code === 403 ? "Forbidden" : "Post not found";
    return c.json({ error }, result.code);
  }

  return c.json({ success: true });
});

// Reply to a post - parentId comes from the path.
posts.post(
  "/:id/reply",
  verifySession,
  validatePostParam,
  validateReplyBody,

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
posts.post("/:id/like", verifySession, validatePostParam, async (c) => {
  const result = await likePost(c.var.userId, c.req.valid("param").id);

  if (!result.ok) return c.json({ error: "Post not found" }, result.code);

  return c.json({ success: true });
});

// Remove a like (idempotent).
posts.delete("/:id/like", verifySession, validatePostParam, async (c) => {
  const result = await unlikePost(c.var.userId, c.req.valid("param").id);

  if (!result.ok) return c.json({ error: "Post not found" }, result.code);

  return c.json({ success: true });
});

// Repost a post (idempotent).
posts.post("/:id/repost", verifySession, validatePostParam, async (c) => {
  const result = await repostPost(c.var.userId, c.req.valid("param").id);

  if (!result.ok) return c.json({ error: "Post not found" }, result.code);

  return c.json({ success: true });
});

// Remove a repost (idempotent).
posts.delete("/:id/repost", verifySession, validatePostParam, async (c) => {
  const result = await unrepostPost(c.var.userId, c.req.valid("param").id);

  if (!result.ok) return c.json({ error: "Post not found" }, result.code);

  return c.json({ success: true });
});

// Public: users who liked a post, newest-like first.
posts.get(
  "/:id/liking_users",
  validatePostParam,
  validateListQuery,

  async (c) => {
    const result = await getLikingUsers(
      c.req.valid("param").id,
      c.req.valid("query"),
    );

    if (!result.ok) return c.json({ error: "Post not found" }, result.code);

    return c.json({ users: result.users });
  },
);
