import { DrizzleQueryError } from "drizzle-orm";

// Postgres SQLSTATE for "duplicate key violates unique constraint".
const UNIQUE_VIOLATION = "23505";

// Drizzle wraps the driver's error in `cause`; Bun's PostgresError carries
// the SQLSTATE in `errno` (its `code` is a generic ERR_POSTGRES_SERVER_ERROR).
export function isUniqueViolation(error: unknown) {
  return (
    error instanceof DrizzleQueryError &&
    (error.cause as { errno?: string } | undefined)?.errno === UNIQUE_VIOLATION
  );
}
