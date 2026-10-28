import { beforeEach, describe, expect, test } from "bun:test";

import { api, MISSING_ID, signup, type TestUser } from "./helpers";

let alice: TestUser;

beforeEach(async () => {
  alice = await signup({ username: "alice", displayName: "Alice" });
});

describe("public profiles", () => {
  test.each([
    ["by id", () => `/users/${alice.id}`],
    ["by username", () => "/users/by/username/alice"],
  ])("%s", async (_, path) => {
    const res = await api("GET", path());

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: alice.id,
      username: "alice",
      displayName: "Alice",
      bio: null,
      followersCount: 0,
      followingCount: 0,
    });
  });

  test("never expose email or verification state", async () => {
    const res = await api("GET", `/users/${alice.id}`);

    expect(res.body.user).not.toHaveProperty("email");
    expect(res.body.user).not.toHaveProperty("emailVerified");
  });

  test.each([
    ["unknown id", `/users/${MISSING_ID}`],
    ["unknown username", "/users/by/username/nobody"],
  ])("%s -> 404", async (_, path) => {
    const res = await api("GET", path);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "User not found" });
  });

  test("username with illegal characters -> 400", async () => {
    const res = await api("GET", "/users/by/username/no-dashes");
    expect(res.status).toBe(400);
  });
});

describe("PATCH /users/me", () => {
  test("updates only the provided fields", async () => {
    const res = await api("PATCH", "/users/me", {
      cookie: alice.cookie,
      body: { bio: "hello", birthDate: "2000-01-31" },
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      displayName: "Alice",
      bio: "hello",
      birthDate: "2000-01-31",
    });

    const profile = await api("GET", `/users/${alice.id}`);
    expect(profile.body.user.bio).toBe("hello");
  });

  test("null clears an optional field", async () => {
    await api("PATCH", "/users/me", { cookie: alice.cookie, body: { bio: "hi" } });
    const res = await api("PATCH", "/users/me", {
      cookie: alice.cookie,
      body: { bio: null },
    });

    expect(res.status).toBe(200);
    expect(res.body.user.bio).toBeNull();
  });

  test.each([
    ["empty body", {}],
    ["bad date", { birthDate: "31/01/2000" }],
    ["empty displayName", { displayName: "" }],
    ["displayName can't be cleared", { displayName: null }],
    ["bio over 500 chars", { bio: "x".repeat(501) }],
  ])("%s -> 400", async (_, body) => {
    const res = await api("PATCH", "/users/me", { cookie: alice.cookie, body });
    expect(res.status).toBe(400);
  });

  test("ignores fields that aren't part of the profile", async () => {
    const res = await api("PATCH", "/users/me", {
      cookie: alice.cookie,
      body: { displayName: "Al", username: "hijacked", email: "x@example.com" },
    });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");

    const me = await api("GET", "/users/me", { cookie: alice.cookie });
    expect(me.body.user.email).toBe(alice.email);
  });

  test("requires a session", async () => {
    const res = await api("PATCH", "/users/me", { body: { bio: "x" } });
    expect(res.status).toBe(401);
  });
});
