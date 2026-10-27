import type { Context } from "hono";
import { checkDatabaseStatus } from "@/database/client";
import { checkRedisStatus } from "@/redis/client";
import { PROBE_TIMEOUT_MS } from "@/config";

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T) {
  let timer: ReturnType<typeof setTimeout>;

  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export default async function healthCheck(c: Context) {
  const [
    { database_healthy, database_latency },
    { redis_healthy, redis_latency },
  ] = await Promise.all([
    withTimeout(checkDatabaseStatus(), PROBE_TIMEOUT_MS, {
      database_healthy: false,
      database_latency: PROBE_TIMEOUT_MS,
    }),

    withTimeout(checkRedisStatus(), PROBE_TIMEOUT_MS, {
      redis_healthy: false,
      redis_latency: PROBE_TIMEOUT_MS,
    }),
  ]);

  const allHealthy = database_healthy && redis_healthy;

  const body = {
    status: allHealthy ? "up" : "degraded",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? "0.1.0",

    services: {
      database: database_healthy
        ? { status: "up", latency_ms: database_latency }
        : { status: "down" },

      redis: redis_healthy
        ? { status: "up", latency_ms: redis_latency }
        : { status: "down" },
    },
  };

  return c.json(body, allHealthy ? 200 : 503);
}
