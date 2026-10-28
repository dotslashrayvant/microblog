import { beforeEach, describe, expect, test } from "bun:test";
import { count, eq } from "drizzle-orm";

import { dbClient } from "@/database/client";
import { reposts } from "@/database/schema";
import {
  api,
  createPost,
  ids,
  MISSING_ID,
  signup,
  type TestUser,
} from "./helpers";

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

beforeEach(async () => {
  [alice, bob, carol] = await Promise.all([
    signup({ username: "alice" }),
    signup({ username: "bob" }),
    signup({ username: "carol" }),
  ]);
});

describe("likes", () => {
  test("are idempotent and show up on both sides", async () => {
    const post = await createPost(alice);

    for (let i = 0; i < 2; i++) {
      const res = await api("POST", `/posts/${post.id}/like`, { cookie: bob.cookie });
      expect(res.status).toBe(200);
    }

    const likers = await api("GET", `/posts/${post.id}/liking_users`);
    expect(likers.body.users).toEqual([
      { id: bob.id, username: "bob", displayName: "bob" },
    ]);

    for (const path of [`/users/${bob.id}/liked_posts`, "/users/by/username/bob/liked_posts"]) {
      const liked = await api("GET", path);
      expect(ids(liked.body.posts)).toEqual([post.id]);
    }
  });

  test("likers are listed newest like first", async () => {
    const post = await createPost(alice);
    await api("POST", `/posts/${post.id}/like`, { cookie: bob.cookie });
    await api("POST", `/posts/${post.id}/like`, { cookie: carol.cookie });

    const res = await api("GET", `/posts/${post.id}/liking_users`);
    expect(ids(res.body.users)).toEqual([carol.id, bob.id]);
  });

  test("unlike is idempotent", async () => {
    const post = await createPost(alice);
    await api("POST", `/posts/${post.id}/like`, { cookie: bob.cookie });

    for (let i = 0; i < 2; i++) {
      const res = await api("DELETE", `/posts/${post.id}/like`, { cookie: bob.cookie });
      expect(res.status).toBe(200);
    }

    const likers = await api("GET", `/posts/${post.id}/liking_users`);
    expect(likers.body.users).toEqual([]);
  });

  test("liked_posts of an unknown user -> 404", async () => {
    const res = await api("GET", `/users/${MISSING_ID}/liked_posts`);
    expect(res.status).toBe(404);
  });
});

describe("reposts", () => {
  const repostCount = async (postId: string) => {
    const [row] = await dbClient
      .select({ n: count() })
      .from(reposts)
      .where(eq(reposts.postId, postId));
    return row!.n;
  };

  test("repost and un-repost are idempotent", async () => {
    const post = await createPost(alice);

    for (let i = 0; i < 2; i++) {
      const res = await api("POST", `/posts/${post.id}/repost`, { cookie: bob.cookie });
      expect(res.status).toBe(200);
    }
    expect(await repostCount(post.id)).toBe(1);

    for (let i = 0; i < 2; i++) {
      const res = await api("DELETE", `/posts/${post.id}/repost`, { cookie: bob.cookie });
      expect(res.status).toBe(200);
    }
    expect(await repostCount(post.id)).toBe(0);
  });
});

// Like/unlike/repost/unrepost share the same guards.
describe.each([
  ["POST", "like"],
  ["DELETE", "like"],
  ["POST", "repost"],
  ["DELETE", "repost"],
])("%s /posts/:id/%s", (method, action) => {
  test("unknown post -> 404", async () => {
    const res = await api(method, `/posts/${MISSING_ID}/${action}`, { cookie: bob.cookie });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Post not found" });
  });

  test("requires a session", async () => {
    const post = await createPost(alice);
    const res = await api(method, `/posts/${post.id}/${action}`);
    expect(res.status).toBe(401);
  });
});

describe("follows", () => {
  const follow = (follower: TestUser, target: TestUser) =>
    api("POST", `/users/${target.id}/follow`, { cookie: follower.cookie });

  test("are idempotent and update both lists and counts", async () => {
    expect((await follow(bob, alice)).status).toBe(200);
    expect((await follow(bob, alice)).status).toBe(200);

    for (const path of [`/users/${alice.id}/followers`, "/users/by/username/alice/followers"]) {
      expect(ids((await api("GET", path)).body.users)).toEqual([bob.id]);
    }
    for (const path of [`/users/${bob.id}/following`, "/users/by/username/bob/following"]) {
      expect(ids((await api("GET", path)).body.users)).toEqual([alice.id]);
    }

    const aliceProfile = await api("GET", `/users/${alice.id}`);
    expect(aliceProfile.body.user).toMatchObject({ followersCount: 1, followingCount: 0 });

    const bobMe = await api("GET", "/users/me", { cookie: bob.cookie });
    expect(bobMe.body.user).toMatchObject({ followersCount: 0, followingCount: 1 });
  });

  test("followers are listed newest follow first", async () => {
    await follow(bob, alice);
    await follow(carol, alice);

    const res = await api("GET", `/users/${alice.id}/followers`);
    expect(ids(res.body.users)).toEqual([carol.id, bob.id]);
  });

  test("unfollow is idempotent and resets counts", async () => {
    await follow(bob, alice);

    for (let i = 0; i < 2; i++) {
      const res = await api("DELETE", `/users/${alice.id}/follow`, { cookie: bob.cookie });
      expect(res.status).toBe(200);
    }

    const profile = await api("GET", `/users/${alice.id}`);
    expect(profile.body.user.followersCount).toBe(0);
  });

  test("can't follow yourself", async () => {
    const res = await follow(alice, alice);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Cannot follow yourself" });
  });

  test.each(["POST", "DELETE"])("%s follow on an unknown user -> 404", async (method) => {
    const res = await api(method, `/users/${MISSING_ID}/follow`, { cookie: bob.cookie });
    expect(res.status).toBe(404);
  });

  test.each(["POST", "DELETE"])("%s follow requires a session", async (method) => {
    const res = await api(method, `/users/${alice.id}/follow`);
    expect(res.status).toBe(401);
  });

  test.each(["followers", "following"])("%s of an unknown user -> 404", async (list) => {
    const res = await api("GET", `/users/${MISSING_ID}/${list}`);
    expect(res.status).toBe(404);
  });
});
