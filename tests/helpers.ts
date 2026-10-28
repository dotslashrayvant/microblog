import { expect } from "bun:test";
import { redis } from "bun";

import app from "@/index";
import { COOKIE_NAME } from "@/config";

// Redis is shared with the dev server (Bun's client can't select a DB), so
// instead of flushing it we remember every key the tests create and delete
// just those at the end of the run.
const sessions = new Set<string>();
const ips = new Set<string>();

export async function cleanupRedis() {
  const keys = [
    ...[...sessions].map((id) => `session:${id}`),
    ...[...ips].map((ip) => `ratelimit:${ip}`),
  ];

  if (keys.length > 0) await redis.del(...keys);
}

type RequestOptions = {
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  // Socket address the rate limiter sees. Random by default, so each request
  // gets its own bucket and only rate-limit tests share one on purpose.
  ip?: string;
};

export type ApiResponse = {
  status: number;
  headers: Headers;
  body: any;
  cookie: string | undefined;
};

// In-process request against the real app; no server or port needed.
export async function api(
  method: string,
  path: string,
  { body, cookie, headers, ip = `test-${crypto.randomUUID()}` }: RequestOptions = {},
): Promise<ApiResponse> {
  ips.add(ip);

  const init: RequestInit = { method, headers: new Headers(headers) };
  const requestHeaders = init.headers as Headers;

  if (body !== undefined) {
    requestHeaders.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }

  if (cookie) requestHeaders.set("cookie", `${COOKIE_NAME}=${cookie}`);

  // @hono/bun's getConnInfo reads the client address from the Bun server.
  const server = {
    requestIP: () => ({ address: ip, family: "IPv4", port: 0 }),
  };

  const res = await app.request(`/api/v1${path}`, init, server);
  const session = sessionCookie(res);
  if (session) sessions.add(session);

  return {
    status: res.status,
    headers: res.headers,
    body: await res.json(),
    cookie: session,
  };
}

function sessionCookie(res: Response) {
  for (const header of res.headers.getSetCookie()) {
    const value = header.match(new RegExp(`^${COOKIE_NAME}=([^;]*)`))?.[1];
    if (value) return value;
  }
}

export type TestUser = {
  id: string;
  cookie: string;
  email: string;
  username: string;
  password: string;
  displayName: string;
};

export async function signup(
  overrides: Partial<Omit<TestUser, "id" | "cookie">> = {},
): Promise<TestUser> {
  const username = overrides.username ?? `u_${crypto.randomUUID().slice(0, 8)}`;
  const input = {
    email: `${username}@example.com`,
    password: "password123",
    displayName: username,
    ...overrides,
    username,
  };

  const res = await api("POST", "/auth/signup", { body: input });
  expect(res.status).toBe(201);

  const cookie = res.cookie!;
  const me = await api("GET", "/users/me", { cookie });

  return { ...input, id: me.body.user.id, cookie };
}

export async function createPost(
  user: TestUser,
  content = "hello world",
  parentId?: string,
) {
  const res = await api("POST", "/posts", {
    cookie: user.cookie,
    body: { content, parentId },
  });
  expect(res.status).toBe(201);

  return res.body.post as { id: string; content: string; parentId: string | null };
}

// Any well-formed UUID that no row will ever have.
export const MISSING_ID = "00000000-0000-4000-8000-000000000000";

export function ids(items: { id: string }[]) {
  return items.map((item) => item.id);
}
