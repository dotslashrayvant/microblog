import { beforeEach, describe, expect, test } from "bun:test";

import { api, createPost, ids, signup, type TestUser } from "./helpers";

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;

beforeEach(async () => {
  [alice, bob, carol] = await Promise.all([signup(), signup(), signup()]);
});

const feed = async (user: TestUser, query = "") => {
  const res = await api("GET", `/feed${query}`, { cookie: user.cookie });
  expect(res.status).toBe(200);
  return ids(res.body.posts);
};

describe("GET /feed", () => {
  test("has your own posts and followed users' posts, newest first", async () => {
    await api("POST", `/users/${alice.id}/follow`, { cookie: bob.cookie });

    const a1 = await createPost(alice, "a1");
    const b1 = await createPost(bob, "b1");
    const c1 = await createPost(carol, "not followed");
    const a2 = await createPost(alice, "a2");

    const posts = await feed(bob);
    expect(posts).toEqual([a2.id, b1.id, a1.id]);
    expect(posts).not.toContain(c1.id);
  });

  test("following is one-way", async () => {
    await api("POST", `/users/${alice.id}/follow`, { cookie: bob.cookie });
    await createPost(bob, "bob's post");

    expect(await feed(alice)).toEqual([]);
  });

  test("unfollowing drops that user's posts", async () => {
    await api("POST", `/users/${alice.id}/follow`, { cookie: bob.cookie });
    await createPost(alice);
    expect(await feed(bob)).toHaveLength(1);

    await api("DELETE", `/users/${alice.id}/follow`, { cookie: bob.cookie });
    expect(await feed(bob)).toEqual([]);
  });

  test("includes replies from followed users", async () => {
    await api("POST", `/users/${alice.id}/follow`, { cookie: bob.cookie });
    const root = await createPost(carol, "root");
    const reply = await createPost(alice, "reply", root.id);

    expect(await feed(bob)).toEqual([reply.id]);
  });

  test("pages with limit and offset", async () => {
    const posts = [];
    for (let i = 0; i < 4; i++) posts.push(await createPost(alice, `p${i}`));
    const newestFirst = ids(posts).reverse();

    expect(await feed(alice, "?limit=3")).toEqual(newestFirst.slice(0, 3));
    expect(await feed(alice, "?limit=3&offset=3")).toEqual(newestFirst.slice(3));
  });

  test("requires a session", async () => {
    const res = await api("GET", "/feed");
    expect(res.status).toBe(401);
  });
});
