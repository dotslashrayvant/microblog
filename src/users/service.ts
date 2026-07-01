import { eq } from "drizzle-orm";

import { db } from "../db";
import { profiles, users } from "../db/schema";
import type { UpdateProfileData } from "./schema";

// Public profile shape — deliberately excludes email / emailVerified.
const publicProfileColumns = {
  id: users.id,
  username: profiles.username,
  displayName: profiles.displayName,
  bio: profiles.bio,
  birthDate: profiles.birthDate,
  createdAt: users.createdAt,
};

export async function getUserById(id: string) {
  const [row] = await db
    .select(publicProfileColumns)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, id));

  if (!row) return { ok: false as const, code: 404 as const };
  return { ok: true as const, user: row };
}

export async function getUserByUsername(username: string) {
  const [row] = await db
    .select(publicProfileColumns)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(profiles.username, username));

  if (!row) return { ok: false as const, code: 404 as const };
  return { ok: true as const, user: row };
}

export async function updateProfile(userId: string, input: UpdateProfileData) {
  // Only provided keys are spread in; updatedAt has no $onUpdate so set it here.
  const [updated] = await db
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
