import { beforeEach, describe, expect, test } from "bun:test";

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

beforeEach(async () => {
  [alice, bob] = await Promise.all([
    signup({ username: "alice" }),
    signup({ username: "bob" }),
  ]);
});

describe("creating posts", () => {
  test("returns the post with its author embedded", async () => {
    const res = await api("POST", "/posts", {
      cookie: alice.cookie,
      body: { content: "first!" },
    });

    expect(res.status).toBe(201);
    expect(res.body.post).toMatchObject({
      content: "first!",
      authorId: alice.id,
      username: "alice",
      parentId: null,
    });
  });

  test("is publicly readable", async () => {
    const post = await createPost(alice, "hello");
    const res = await api("GET", `/posts/${post.id}`);

    expect(res.status).toBe(200);
    expect(res.body.post.content).toBe("hello");
  });

  test.each([
    ["empty", "", 400],
    ["281 chars", "x".repeat(281), 400],
    ["exactly 280 chars", "x".repeat(280), 201],
  ])("content %s -> %d", async (_, content, status) => {
    const res = await api("POST", "/posts", {
      cookie: alice.cookie,
      body: { content },
    });
    expect(res.status).toBe(status);
  });

  test("requires a session", async () => {
    const res = await api("POST", "/posts", { body: { content: "hi" } });
    expect(res.status).toBe(401);
  });

  test("unknown post -> 404", async () => {
    const res = await api("GET", `/posts/${MISSING_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("replies", () => {
  test("POST /posts/:id/reply and parentId produce the same thing", async () => {
    const parent = await createPost(alice, "parent");

    const viaPath = await api("POST", `/posts/${parent.id}/reply`, {
      cookie: bob.cookie,
      body: { content: "reply" },
    });
    const viaBody = await createPost(bob, "reply", parent.id);

    expect(viaPath.status).toBe(201);
    expect(viaPath.body.post.parentId).toBe(parent.id);
    expect(viaBody.parentId).toBe(parent.id);
  });

  test.each([
    ["via path", () => api("POST", `/posts/${MISSING_ID}/reply`, { cookie: alice.cookie, body: { content: "x" } })],
    ["via parentId", () => api("POST", "/posts", { cookie: alice.cookie, body: { content: "x", parentId: MISSING_ID } })],
  ])("missing parent %s -> 404", async (_, request) => {
    const res = await request();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Parent post not found" });
  });
});

describe("editing and deleting", () => {
  test("the author can edit, which bumps updatedAt", async () => {
    const post = await createPost(alice, "draft");
    const before = (await api("GET", `/posts/${post.id}`)).body.post;

    const res = await api("PATCH", `/posts/${post.id}`, {
      cookie: alice.cookie,
      body: { content: "final" },
    });

    expect(res.status).toBe(200);
    expect(res.body.post.content).toBe("final");
    expect(Date.parse(res.body.post.updatedAt)).toBeGreaterThan(
      Date.parse(before.updatedAt),
    );
  });

  test.each(["PATCH", "DELETE"])("%s someone else's post -> 403", async (method) => {
    const post = await createPost(alice, "mine");

    const res = await api(method, `/posts/${post.id}`, {
      cookie: bob.cookie,
      body: method === "PATCH" ? { content: "yours now" } : undefined,
    });

    expect(res.status).toBe(403);
    expect((await api("GET", `/posts/${post.id}`)).body.post.content).toBe("mine");
  });

  test.each(["PATCH", "DELETE"])("%s unknown post -> 404", async (method) => {
    const res = await api(method, `/posts/${MISSING_ID}`, {
      cookie: alice.cookie,
      body: method === "PATCH" ? { content: "x" } : undefined,
    });
    expect(res.status).toBe(404);
  });

  test("deleting a post removes its whole reply tree and its likes", async () => {
    const root = await createPost(alice, "root");
    const reply = await createPost(bob, "reply", root.id);
    const nested = await createPost(alice, "nested", reply.id);
    const unrelated = await createPost(alice, "unrelated");
    await api("POST", `/posts/${root.id}/like`, { cookie: bob.cookie });

    const res = await api("DELETE", `/posts/${root.id}`, { cookie: alice.cookie });
    expect(res.status).toBe(200);

    for (const gone of [root, reply, nested]) {
      expect((await api("GET", `/posts/${gone.id}`)).status).toBe(404);
    }
    expect((await api("GET", `/posts/${unrelated.id}`)).status).toBe(200);

    const liked = await api("GET", `/users/${bob.id}/liked_posts`);
    expect(liked.body.posts).toEqual([]);
  });
});

describe("author timelines", () => {
  test.each([
    ["by id", () => `/users/${alice.id}/posts`],
    ["by username", () => "/users/by/username/alice/posts"],
  ])("%s lists only the author's posts, newest first", async (_, path) => {
    const first = await createPost(alice, "1");
    const second = await createPost(alice, "2");
    await createPost(bob, "not alice");

    const res = await api("GET", path());

    expect(res.status).toBe(200);
    expect(ids(res.body.posts)).toEqual([second.id, first.id]);
  });

  test("pages with limit and offset", async () => {
    const posts = [];
    for (let i = 0; i < 5; i++) posts.push(await createPost(alice, `post ${i}`));
    const newestFirst = ids(posts).reverse();

    const page1 = await api("GET", `/users/${alice.id}/posts?limit=2`);
    const page2 = await api("GET", `/users/${alice.id}/posts?limit=2&offset=2`);
    const past = await api("GET", `/users/${alice.id}/posts?offset=100`);

    expect(ids(page1.body.posts)).toEqual(newestFirst.slice(0, 2));
    expect(ids(page2.body.posts)).toEqual(newestFirst.slice(2, 4));
    expect(past.body.posts).toEqual([]);
  });

  test.each(["limit=0", "limit=101", "limit=1.5", "offset=-1", "limit=abc"])(
    "?%s -> 400",
    async (query) => {
      const res = await api("GET", `/users/${alice.id}/posts?${query}`);
      expect(res.status).toBe(400);
    },
  );

  test.each([
    ["unknown id", `/users/${MISSING_ID}/posts`],
    ["unknown username", "/users/by/username/nobody/posts"],
  ])("%s -> 404", async (_, path) => {
    expect((await api("GET", path)).status).toBe(404);
  });
});
