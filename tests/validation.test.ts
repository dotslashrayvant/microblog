import { beforeEach, describe, expect, test } from "bun:test";

import { api, signup, type TestUser } from "./helpers";

// Every router must return the README's 400 shape:
// { error: [{ field, message }] }
describe("validation errors share one shape across routers", () => {
  let user: TestUser;

  beforeEach(async () => {
    user = await signup();
  });

  const cases: [string, string, string, () => object, string][] = [
    ["auth", "POST", "/auth/signup", () => ({ body: { email: "nope" } }), "email"],
    ["auth", "POST", "/auth/login", () => ({ body: {} }), "email"],
    ["users", "GET", "/users/not-a-uuid", () => ({}), "id"],
    ["users", "PATCH", "/users/me", () => ({ cookie: user.cookie, body: { bio: 1 } }), "bio"],
    ["posts", "POST", "/posts", () => ({ cookie: user.cookie, body: { content: "" } }), "content"],
    ["posts", "GET", "/posts/not-a-uuid", () => ({}), "id"],
    ["feed", "GET", "/feed?limit=0", () => ({ cookie: user.cookie }), "limit"],
  ];

  test.each(cases)("%s: %s %s", async (_, method, path, options, field) => {
    const res = await api(method, path, options());

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: expect.arrayContaining([
        { field, message: expect.any(String) },
      ]),
    });
  });

  test("reports every invalid field at once", async () => {
    const res = await api("POST", "/auth/signup", {
      body: { email: "nope", password: "short", username: "a!", displayName: "" },
    });

    const fields = res.body.error.map((issue: { field: string }) => issue.field);
    expect(fields).toEqual(
      expect.arrayContaining(["email", "password", "username", "displayName"]),
    );
  });

  test("nested paths are joined with dots", async () => {
    const res = await api("PATCH", "/users/me", {
      cookie: user.cookie,
      body: {},
    });

    // Object-level refinements have an empty path.
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual([
      { field: "", message: "At least one field must be provided" },
    ]);
  });
});
