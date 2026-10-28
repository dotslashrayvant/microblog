import { Hono } from "hono";

import { validate } from "@/middleware/validate";
import { verifySession } from "@/middleware/verify-session";
import { PostListQuerySchema } from "@/posts/schema";
import { getLikedPostsByUserId, getPostsByAuthorId } from "@/posts/service";
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

export const users = new Hono();

const validateUserId = validate("param", UserIdParamSchema);
const validateUsername = validate("param", UsernameParamSchema);
const validateListQuery = validate("query", PostListQuerySchema);
const validateProfileUpdate = validate("json", UpdateProfileSchema);

// The authenticated user's own profile (includes email).
users.get("/me", verifySession, async (c) => {
  const result = await getOwnProfile(c.var.userId);
  if (!result.ok) return c.json({ error: "User not found" }, result.code);

  return c.json({ user: result.user });
});

// Update the authenticated user's profile.
users.patch("/me", verifySession, validateProfileUpdate, async (c) => {
  const result = await updateProfile(c.var.userId, c.req.valid("json"));
  if (!result.ok) return c.json({ error: "User not found" }, result.code);

  return c.json({ user: result.user });
});

// Public profile by username/handle.
users.get("/by/username/:username", validateUsername, async (c) => {
  const result = await getUserByUsername(c.req.valid("param").username);
  if (!result.ok) return c.json({ error: "User not found" }, result.code);

  return c.json({ user: result.user });
});

// Posts authored by a username, newest first.
users.get(
  "/by/username/:username/posts",
  validateUsername,
  validateListQuery,
  async (c) => {
    const user = await getUserByUsername(c.req.valid("param").username);
    if (!user.ok) return c.json({ error: "User not found" }, user.code);

    const result = await getPostsByAuthorId(user.user.id, c.req.valid("query"));
    return c.json({ posts: result.posts });
  },
);

// Posts liked by a username, newest like first.
users.get(
  "/by/username/:username/liked_posts",
  validateUsername,
  validateListQuery,
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

// Users who follow a username, newest follow first.
users.get(
  "/by/username/:username/followers",
  validateUsername,
  validateListQuery,
  async (c) => {
    const user = await getUserByUsername(c.req.valid("param").username);
    if (!user.ok) return c.json({ error: "User not found" }, user.code);

    const result = await getFollowers(user.user.id, c.req.valid("query"));
    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ users: result.users });
  },
);

// Users a username follows, newest follow first.
users.get(
  "/by/username/:username/following",
  validateUsername,
  validateListQuery,
  async (c) => {
    const user = await getUserByUsername(c.req.valid("param").username);
    if (!user.ok) return c.json({ error: "User not found" }, user.code);

    const result = await getFollowing(user.user.id, c.req.valid("query"));
    if (!result.ok) return c.json({ error: "User not found" }, result.code);

    return c.json({ users: result.users });
  },
);

// Public profile by id.
users.get("/:id", validateUserId, async (c) => {
  const result = await getUserById(c.req.valid("param").id);
  if (!result.ok) return c.json({ error: "User not found" }, result.code);

  return c.json({ user: result.user });
});

// Posts authored by a user id, newest first.
users.get("/:id/posts", validateUserId, validateListQuery, async (c) => {
  const { id } = c.req.valid("param");
  const user = await getUserById(id);
  if (!user.ok) return c.json({ error: "User not found" }, user.code);

  const result = await getPostsByAuthorId(id, c.req.valid("query"));
  return c.json({ posts: result.posts });
});

// Posts liked by a user id, newest like first.
users.get("/:id/liked_posts", validateUserId, validateListQuery, async (c) => {
  const { id } = c.req.valid("param");
  const user = await getUserById(id);
  if (!user.ok) return c.json({ error: "User not found" }, user.code);

  const result = await getLikedPostsByUserId(id, c.req.valid("query"));
  return c.json({ posts: result.posts });
});

// Users who follow a user id, newest follow first.
users.get("/:id/followers", validateUserId, validateListQuery, async (c) => {
  const result = await getFollowers(
    c.req.valid("param").id,
    c.req.valid("query"),
  );

  if (!result.ok) return c.json({ error: "User not found" }, result.code);

  return c.json({ users: result.users });
});

// Users a user id follows, newest follow first.
users.get("/:id/following", validateUserId, validateListQuery, async (c) => {
  const result = await getFollowing(
    c.req.valid("param").id,
    c.req.valid("query"),
  );

  if (!result.ok) return c.json({ error: "User not found" }, result.code);

  return c.json({ users: result.users });
});

// Follow a user (idempotent - repeating is a no-op).
users.post("/:id/follow", verifySession, validateUserId, async (c) => {
  const result = await followUser(c.var.userId, c.req.valid("param").id);

  if (!result.ok) {
    const error =
      result.code === 400 ? "Cannot follow yourself" : "User not found";

    return c.json({ error }, result.code);
  }

  return c.json({ success: true });
});

// Remove a follow (idempotent).
users.delete("/:id/follow", verifySession, validateUserId, async (c) => {
  const result = await unfollowUser(c.var.userId, c.req.valid("param").id);
  if (!result.ok) return c.json({ error: "User not found" }, result.code);

  return c.json({ success: true });
});
