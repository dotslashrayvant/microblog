import { redis } from "bun";

export async function checkRedisStatus() {
  const start = performance.now();

  try {
    const healthy = (await redis.ping()) === "PONG";
    return {
      redis_healthy: healthy,
      redis_latency: Math.round(performance.now() - start),
    };
  } catch {
    return {
      redis_healthy: false,
      redis_latency: Math.round(performance.now() - start),
    };
  }
}
