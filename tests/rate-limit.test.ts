import { describe, expect, test } from "bun:test";
import { redis } from "bun";
import { Hono } from "hono";

import { AUTH_OPS_LIMIT, AUTH_RATE_LIMIT_SECONDS } from "@/config";
import { clientIp } from "@/middleware/rate-limit";
import { api } from "./helpers";

// An invalid login still counts (the limiter runs before validation), and it
// skips password hashing, so these tests stay fast.
const attempt = (ip: string) => api("POST", "/auth/login", { ip, body: {} });

describe("auth rate limit", () => {
  test(`allows ${AUTH_OPS_LIMIT} attempts per window, then 429s`, async () => {
    const ip = `test-${crypto.randomUUID()}`;

    for (let i = 0; i < AUTH_OPS_LIMIT; i++) {
      expect((await attempt(ip)).status).toBe(400);
    }

    const blocked = await attempt(ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many requests/i);
  });

  test("buckets are per client IP", async () => {
    const noisy = `test-${crypto.randomUUID()}`;
    for (let i = 0; i <= AUTH_OPS_LIMIT; i++) await attempt(noisy);

    expect((await attempt(noisy)).status).toBe(429);
    expect((await attempt(`test-${crypto.randomUUID()}`)).status).toBe(400);
  });

  test("every bucket gets a TTL on its first hit", async () => {
    const ip = `test-${crypto.randomUUID()}`;
    await attempt(ip);

    const ttl = await redis.ttl(`ratelimit:${ip}`);
    expect(ttl).toBeGreaterThan(AUTH_RATE_LIMIT_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(AUTH_RATE_LIMIT_SECONDS);
  });

  test("later hits don't extend the window", async () => {
    const ip = `test-${crypto.randomUUID()}`;
    const key = `ratelimit:${ip}`;

    await attempt(ip);
    await redis.expire(key, 100);
    await attempt(ip);

    expect(await redis.ttl(key)).toBeLessThanOrEqual(100);
    expect(await redis.get(key)).toBe("2");
  });

  test("non-auth routes are not limited", async () => {
    const ip = `test-${crypto.randomUUID()}`;
    for (let i = 0; i <= AUTH_OPS_LIMIT; i++) await attempt(ip);

    const res = await api("GET", "/posts/not-a-uuid", { ip });
    expect(res.status).toBe(400);
  });
});

describe("clientIp", () => {
  const ipFor = async (trustProxy: boolean, headers: Record<string, string> = {}) => {
    const app = new Hono().get("/", (c) => c.text(clientIp(c, trustProxy)));
    const server = { requestIP: () => ({ address: "10.0.0.1", family: "IPv4", port: 0 }) };

    return (await app.request("/", { headers }, server)).text();
  };

  test("uses the socket address by default", async () => {
    expect(await ipFor(false)).toBe("10.0.0.1");
  });

  test("ignores X-Forwarded-For unless the proxy is trusted", async () => {
    expect(await ipFor(false, { "x-forwarded-for": "6.6.6.6" })).toBe("10.0.0.1");
  });

  test("behind a trusted proxy, uses the hop the proxy appended", async () => {
    // The client controls everything left of the last hop.
    const headers = { "x-forwarded-for": "6.6.6.6, 203.0.113.7" };
    expect(await ipFor(true, headers)).toBe("203.0.113.7");
  });

  test("falls back to the socket when a trusted proxy sends no header", async () => {
    expect(await ipFor(true)).toBe("10.0.0.1");
  });
});
