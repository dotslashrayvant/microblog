import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const db = drizzle(process.env.DATABASE_URL!);
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied ✅");
process.exit(0);
