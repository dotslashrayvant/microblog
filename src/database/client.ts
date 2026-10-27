import { drizzle } from "drizzle-orm/bun-sql";
import { sql } from "drizzle-orm";

export const dbClient = drizzle(process.env.DATABASE_URL!);

export async function checkDatabaseStatus() {
  const start = performance.now();

  try {
    await dbClient.execute(sql`SELECT 1`);
    return {
      database_healthy: true,
      database_latency: Math.round(performance.now() - start),
    };
  } catch {
    return {
      database_healthy: false,
      database_latency: Math.round(performance.now() - start),
    };
  }
}
