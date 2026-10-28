import { redis } from "bun";
import type { Context } from "hono";
import { getConnInfo } from "@hono/bun";
import { createMiddleware } from "hono/factory";

import { AUTH_OPS_LIMIT, AUTH_RATE_LIMIT_SECONDS, TRUST_PROXY } from "@/config";

// Behind a trusted proxy the socket address is the proxy's, so use the
// last X-Forwarded-For hop (the one our proxy appended) instead.
export function clientIp(c: Context, trustProxy = TRUST_PROXY) {
  if (trustProxy) {
    const hop = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (hop) return hop;
  }

  return getConnInfo(c).remote.address ?? "unknown";
}

export const rateLimit = createMiddleware(async (c, next) => {
  const key = `ratelimit:${clientIp(c)}`;

  // Create the key with its TTL first so INCR can never leave a key that
  // doesn't expire (INCR keeps an existing TTL).
  await redis.set(key, "0", "EX", String(AUTH_RATE_LIMIT_SECONDS), "NX");
  const count = await redis.incr(key);

  if (count > AUTH_OPS_LIMIT) {
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  }

  await next();
});
