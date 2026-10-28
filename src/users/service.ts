import { and, desc, eq } from "drizzle-orm";

import type { PostListQuery } from "@/posts/schema";
import type { UpdateProfileData } from "./schema";

import { dbClient } from "@/database/client";
import { follows, profiles, users } from "@/database/schema";

// Correlated count subqueries, embedded in the profile selects below.
const followCounts = {
  followersCount: dbClient.$count(follows, eq(follows.followeeId, users.id)),
  followingCount: dbClient.$count(follows, eq(follows.followerId, users.id)),
};

// Public profile shape - deliberately excludes email / emailVerified.
const publicProfileColumns = {
  id: users.id,
  username: profiles.username,
  displayName: profiles.displayName,

  bio: profiles.bio,

  birthDate: profiles.birthDate,
  createdAt: users.createdAt,

  ...followCounts,
};

export async function getUserById(id: string) {
  const [row] = await dbClient
    .select(publicProfileColumns)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, id));

  if (!row) return { ok: false as const, code: 404 as const };

  return { ok: true as const, user: row };
}

export async function getUserByUsername(username: string) {
  const [row] = await dbClient
    .select(publicProfileColumns)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(profiles.username, username));

  if (!row) return { ok: false as const, code: 404 as const };

  return { ok: true as const, user: row };
}

export async function updateProfile(userId: string, input: UpdateProfileData) {
  // Only provided keys are spread in; updatedAt has no $onUpdate so set it here.
  const [updated] = await dbClient
    .update(profiles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning({
      id: profiles.userId,
      username: profiles.username,
      displayName: profiles.displayName,
      bio: profiles.bio,
      birthDate: profiles.birthDate,
    });

  if (!updated) return { ok: false as const, code: 404 as const };

  return { ok: true as const, user: updated };
}

// Authenticated self-view - includes email / emailVerified
export async function getOwnProfile(userId: string) {
  const [row] = await dbClient
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      username: profiles.username,
      displayName: profiles.displayName,
      bio: profiles.bio,
      birthDate: profiles.birthDate,
      ...followCounts,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId));

  if (!row) return { ok: false as const, code: 404 as const };

  return { ok: true as const, user: row };
}

// Follow / unfollow are idempotent: onConflictDoNothing means a repeat is a no-op.
export async function followUser(followerId: string, targetId: string) {
  if (followerId === targetId)
    return { ok: false as const, code: 400 as const };

  if (!(await userExists(targetId)))
    return { ok: false as const, code: 404 as const };

  await dbClient
    .insert(follows)
    .values({ followerId, followeeId: targetId })
    .onConflictDoNothing();

  return { ok: true as const };
}

export async function unfollowUser(followerId: string, targetId: string) {
  if (!(await userExists(targetId)))
    return { ok: false as const, code: 404 as const };

  await dbClient
    .delete(follows)
    .where(
      and(eq(follows.followerId, followerId), eq(follows.followeeId, targetId)),
    );

  return { ok: true as const };
}

// Users who follow userId, newest follow first.
export async function getFollowers(
  userId: string,
  { limit, offset }: PostListQuery,
) {
  if (!(await userExists(userId)))
    return { ok: false as const, code: 404 as const };

  const rows = await dbClient
    .select({
      id: profiles.userId,
      username: profiles.username,
      displayName: profiles.displayName,
    })
    .from(follows)
    .innerJoin(profiles, eq(profiles.userId, follows.followerId))
    .where(eq(follows.followeeId, userId))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

  return { ok: true as const, users: rows };
}

// Users that userId follows, newest follow first.
export async function getFollowing(
  userId: string,
  { limit, offset }: PostListQuery,
) {
  if (!(await userExists(userId)))
    return { ok: false as const, code: 404 as const };

  const rows = await dbClient
    .select({
      id: profiles.userId,
      username: profiles.username,
      displayName: profiles.displayName,
    })
    .from(follows)
    .innerJoin(profiles, eq(profiles.userId, follows.followeeId))
    .where(eq(follows.followerId, userId))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

  return { ok: true as const, users: rows };
}

async function userExists(id: string) {
  const [row] = await dbClient
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id));

  return Boolean(row);
}
