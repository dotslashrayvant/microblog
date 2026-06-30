import { redis } from "bun";
import { getConnInfo } from "hono/bun";
import { createMiddleware } from "hono/factory";

import { AUTH_OPS_LIMIT, AUTH_RATE_LIMIT_SECONDS } from "../config";

export const rateLimit = createMiddleware(async (c, next) => {
  const info = getConnInfo(c);
  const ip = info.remote.address;

  const key = `ratelimit:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, AUTH_RATE_LIMIT_SECONDS);
  }

  if (count > AUTH_OPS_LIMIT) {
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  }

  await next();
});
