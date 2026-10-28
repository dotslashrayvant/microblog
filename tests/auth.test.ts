import { describe, expect, test } from "bun:test";
import { redis } from "bun";

import { SESSION_TTL_SECONDS } from "@/config";
import { api, signup } from "./helpers";

describe("POST /auth/signup", () => {
  test("creates the user and starts a session", async () => {
    const res = await api("POST", "/auth/signup", {
      body: {
        email: "alice@example.com",
        password: "password123",
        username: "alice",
        displayName: "Alice",
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true });
    expect(res.headers.get("cache-control")).toBe("no-store");

    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const me = await api("GET", "/users/me", { cookie: res.cookie });
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      email: "alice@example.com",
      username: "alice",
      displayName: "Alice",
      emailVerified: false,
    });
  });

  test("never stores the plain-text password", async () => {
    const user = await signup();
    const me = await api("GET", "/users/me", { cookie: user.cookie });

    expect(JSON.stringify(me.body)).not.toContain(user.password);
    expect(me.body.user).not.toHaveProperty("passwordHash");
  });

  test.each([
    ["duplicate email", { email: "taken@example.com" }],
    ["duplicate username", { username: "taken_name" }],
  ])("%s -> 409 with a generic message", async (_, clash) => {
    await signup({ email: "taken@example.com", username: "taken_name" });

    const res = await api("POST", "/auth/signup", {
      body: {
        email: "fresh@example.com",
        password: "password123",
        username: "fresh_name",
        displayName: "Fresh",
        ...clash,
      },
    });

    expect(res.status).toBe(409);
    // Same message either way, so signup can't be used to probe accounts.
    expect(res.body).toEqual({ error: "Registration failed" });
  });

  // Both requests pass the "taken?" pre-checks, so the loser is only caught
  // by the unique constraint; that must still be a 409, not a 500.
  test.each([
    ["username", (n: number) => ({ email: `racer${n}@example.com`, username: "racer" })],
    ["email", (n: number) => ({ email: "racer@example.com", username: `racer${n}` })],
  ])("concurrent signups for one %s: one wins, the other gets 409", async (_, clash) => {
    const attempt = (n: number) =>
      api("POST", "/auth/signup", {
        body: { password: "password123", displayName: "Racer", ...clash(n) },
      });

    const statuses = (await Promise.all([attempt(1), attempt(2)])).map((r) => r.status);
    expect(statuses.sort()).toEqual([201, 409]);
  });
});

describe("POST /auth/login", () => {
  test("correct credentials start a new session", async () => {
    const user = await signup();

    const res = await api("POST", "/auth/login", {
      body: { email: user.email, password: user.password },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.cookie).toBeDefined();
    expect(res.cookie).not.toBe(user.cookie);

    const me = await api("GET", "/users/me", { cookie: res.cookie });
    expect(me.body.user.id).toBe(user.id);
  });

  test("wrong password and unknown email look identical", async () => {
    const user = await signup();

    const wrongPassword = await api("POST", "/auth/login", {
      body: { email: user.email, password: "not-the-password" },
    });
    const unknownEmail = await api("POST", "/auth/login", {
      body: { email: "nobody@example.com", password: user.password },
    });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Incorrect email or password" });
      expect(res.cookie).toBeUndefined();
    }
  });
});

describe("sessions", () => {
  test("expire after SESSION_TTL_SECONDS", async () => {
    const user = await signup();
    const ttl = await redis.ttl(`session:${user.cookie}`);

    expect(ttl).toBeGreaterThan(SESSION_TTL_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_SECONDS);
  });

  test("logout destroys the session", async () => {
    const user = await signup();

    const res = await api("POST", "/auth/logout", { cookie: user.cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");

    const me = await api("GET", "/users/me", { cookie: user.cookie });
    expect(me.status).toBe(401);
  });

  test("logout without a session is a no-op", async () => {
    const res = await api("POST", "/auth/logout");
    expect(res.status).toBe(200);
  });

  test.each([
    ["no cookie", undefined],
    ["unknown session id", crypto.randomUUID()],
  ])("%s -> 401", async (_, cookie) => {
    const res = await api("GET", "/users/me", { cookie });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });
});
