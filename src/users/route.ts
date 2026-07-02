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
  followUser,
  getFollowers,
  getFollowing,
  getOwnProfile,
  getUserById,
  getUserByUsername,
  unfollowUser,
  updateProfile,
} from "./service";

import { PostListQuerySchema } from "../posts/schema";
import { getLikedPostsByUserId, getPostsByAuthorId } from "../posts/service";

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

// Public: users who follow a username, newest follow first.
users.get(
  "/by/username/:username/followers",

  zValidator("param", UsernameParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  async (c) => {
    const user = await getUserByUsername(c.req.valid("param").username);
    if (!user.ok) return c.json({ error: "User not found" }, user.code);

    const result = await getFollowers(user.user.id, c.req.valid("query"));
    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ users: result.users });
  },
);

// Public: users a username follows, newest follow first.
users.get(
  "/by/username/:username/following",

  zValidator("param", UsernameParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  async (c) => {
    const user = await getUserByUsername(c.req.valid("param").username);
    if (!user.ok) return c.json({ error: "User not found" }, user.code);

    const result = await getFollowing(user.user.id, c.req.valid("query"));
    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ users: result.users });
  },
);

// Public: posts liked by a username, newest-like first.
users.get(
  "/by/username/:username/liked_posts",

  zValidator("param", UsernameParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  async (c) => {
    const user = await getUserByUsername(c.req.valid("param").username);
    if (!user.ok) return c.json({ error: "User not found" }, user.code);

    const result = await getLikedPostsByUserId(
      user.user.id,
      c.req.valid("query"),
    );

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

// Public: posts liked by a user id, newest-like first.
users.get(
  "/:id/liked_posts",

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

    const result = await getLikedPostsByUserId(id, c.req.valid("query"));

    return c.json({ posts: result.posts });
  },
);

// Follow a user (idempotent - repeating is a no-op).
users.post(
  "/:id/follow",

  verifySession,

  zValidator("param", UserIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  async (c) => {
    const result = await followUser(c.var.userId, c.req.valid("param").id);

    if (!result.ok) {
      const error =
        result.code === 400 ? "Cannot follow yourself" : "User not found";

      return c.json({ error }, result.code);
    }

    return c.json({ success: true });
  },
);

// Remove a follow (idempotent).
users.delete(
  "/:id/follow",

  verifySession,

  zValidator("param", UserIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  async (c) => {
    const result = await unfollowUser(c.var.userId, c.req.valid("param").id);
    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ success: true });
  },
);

// Public: users who follow a user id, newest follow first.
users.get(
  "/:id/followers",

  zValidator("param", UserIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  async (c) => {
    const result = await getFollowers(
      c.req.valid("param").id,
      c.req.valid("query"),
    );

    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ users: result.users });
  },
);

// Public: users a user id follows, newest follow first.
users.get(
  "/:id/following",

  zValidator("param", UserIdParamSchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  zValidator("query", PostListQuerySchema, (res, c) => {
    if (!res.success) return badRequest(c, res.error.issues);
  }),

  async (c) => {
    const result = await getFollowing(
      c.req.valid("param").id,
      c.req.valid("query"),
    );

    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ users: result.users });
  },
);
