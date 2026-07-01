import { desc, eq } from "drizzle-orm";

import { db } from "../db";
import { posts, profiles } from "../db/schema";
import type { CreatePostData, PostListQuery, UpdatePostData } from "./schema";

// Public post shape, embeds the author's handle + display name.
const postColumns = {
  id: posts.id,
  content: posts.content,

  parentId: posts.parentId,
  authorId: posts.authorId,

  username: profiles.username,
  displayName: profiles.displayName,

  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
};

async function fetchPostById(id: string) {
  const [row] = await db
    .select(postColumns)
    .from(posts)
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .where(eq(posts.id, id));

  return row;
}

export async function createPost(authorId: string, input: CreatePostData) {
  // A reply must point at an existing parent.
  if (input.parentId) {
    const [parent] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, input.parentId));

    if (!parent) return { ok: false as const, code: 404 as const };
  }

  const [created] = await db
    .insert(posts)
    .values({
      authorId,
      content: input.content,
      parentId: input.parentId ?? null,
    })
    .returning({ id: posts.id });

  if (!created) return { ok: false as const, code: 500 as const };

  const post = await fetchPostById(created.id);
  if (!post) return { ok: false as const, code: 500 as const };

  return { ok: true as const, post };
}

export async function getPostById(id: string) {
  const post = await fetchPostById(id);
  if (!post) return { ok: false as const, code: 404 as const };

  return { ok: true as const, post };
}

export async function updatePost(
  id: string,
  authorId: string,
  input: UpdatePostData,
) {
  const [existing] = await db
    .select({ authorId: posts.authorId })
    .from(posts)
    .where(eq(posts.id, id));

  if (!existing) return { ok: false as const, code: 404 as const };
  if (existing.authorId !== authorId)
    return { ok: false as const, code: 403 as const };

  // updatedAt has no $onUpdate, so set it here (matches the profiles service).
  await db
    .update(posts)
    .set({ content: input.content, updatedAt: new Date() })
    .where(eq(posts.id, id));

  const post = await fetchPostById(id);
  if (!post) return { ok: false as const, code: 500 as const };

  return { ok: true as const, post };
}

export async function deletePost(id: string, authorId: string) {
  const [existing] = await db
    .select({ authorId: posts.authorId })
    .from(posts)
    .where(eq(posts.id, id));

  if (!existing) return { ok: false as const, code: 404 as const };
  if (existing.authorId !== authorId)
    return { ok: false as const, code: 403 as const };

  // parent_id cascades, so replies to this post are removed too.
  await db.delete(posts).where(eq(posts.id, id));

  return { ok: true as const };
}

export async function getPostsByAuthorId(
  authorId: string,
  { limit, offset }: PostListQuery,
) {
  const rows = await db
    .select(postColumns)
    .from(posts)
    .innerJoin(profiles, eq(profiles.userId, posts.authorId))
    .where(eq(posts.authorId, authorId))
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);

  return { ok: true as const, posts: rows };
}
