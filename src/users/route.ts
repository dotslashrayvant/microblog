import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";

import { verifySession } from "../middleware/verify-session";
import {
  UpdateProfileSchema,
  UserIdParamSchema,
  UsernameParamSchema,
} from "./schema";
import {
  getOwnProfile,
  getUserById,
  getUserByUsername,
  updateProfile,
} from "./service";
import { PostListQuerySchema } from "../posts/schema";
import { getPostsByAuthorId } from "../posts/service";

export const users = new Hono();

// Same 400 shape used by the auth routes.
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

// Update the authenticated user's profile.
users.patch(
  "/me",
  verifySession,
  zValidator("json", UpdateProfileSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await updateProfile(c.var.userId, c.req.valid("json"));
    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ user: result.user });
  },
);

// The authenticated user's own profile (includes email). Registered before
// "/:id" so "me" isn't parsed as an id.
users.get("/me", verifySession, async (c) => {
  const result = await getOwnProfile(c.var.userId);
  if (!result.ok) return c.json({ error: "User not found" }, result.code);

  return c.json({ user: result.user });
});

// Public lookup by username/handle. Registered before "/:id" for clarity.
users.get(
  "/by/username/:username",
  zValidator("param", UsernameParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await getUserByUsername(c.req.valid("param").username);
    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ user: result.user });
  },
);

// Public: posts authored by a username, newest-first.
users.get(
  "/by/username/:username/posts",
  zValidator("param", UsernameParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const user = await getUserByUsername(c.req.valid("param").username);
    if (!user.ok) return c.json({ error: "User not found" }, user.code);

    const result = await getPostsByAuthorId(user.user.id, c.req.valid("query"));
    return c.json({ posts: result.posts });
  },
);

// Public lookup by id.
users.get(
  "/:id",
  zValidator("param", UserIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const result = await getUserById(c.req.valid("param").id);
    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ user: result.user });
  },
);

// Public: posts authored by a user id, newest-first.
users.get(
  "/:id/posts",
  zValidator("param", UserIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const user = await getUserById(id);
    if (!user.ok) return c.json({ error: "User not found" }, user.code);

    const result = await getPostsByAuthorId(id, c.req.valid("query"));
    return c.json({ posts: result.posts });
  },
);
