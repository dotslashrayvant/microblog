// Preloaded by bunfig.toml before any test file is imported.
//
// Points the app at a dedicated `<db>_test` database (created and migrated
// on first run) and empties it before every test, so tests never touch dev
// data and never depend on each other.
import { SQL } from "bun";
import { afterAll, beforeEach, spyOn } from "bun:test";
import { sql } from "drizzle-orm";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!url.pathname.endsWith("_test")) url.pathname += "_test";
const testDb = url.pathname.slice(1);

// CREATE DATABASE has to run from another database on the same server.
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new SQL(adminUrl.toString());

const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${testDb}`;
if (existing.length === 0) await admin.unsafe(`CREATE DATABASE "${testDb}"`);
await admin.close();

// Must be set before anything imports @/database/client.
process.env.DATABASE_URL = url.toString();

// Keep test output readable; TEST_LOGS=1 shows request logs and app output.
// Also before the app import, since hono's logger captures console.log.
if (!process.env.TEST_LOGS) spyOn(console, "log").mockImplementation(() => {});

const { dbClient } = await import("@/database/client");
const { migrate } = await import("drizzle-orm/bun-sql/migrator");
const { cleanupRedis } = await import("./helpers");

await migrate(dbClient, { migrationsFolder: `${import.meta.dir}/../drizzle` });

beforeEach(async () => {
  // CASCADE also clears profiles, likes, follows and reposts.
  await dbClient.execute(sql`TRUNCATE users, posts CASCADE`);
});

afterAll(cleanupRedis);
