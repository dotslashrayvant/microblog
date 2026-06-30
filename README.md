# microblog

A microblogging JSON API built on [Bun](https://bun.com) and [Hono](https://hono.dev), with Postgres (via Drizzle ORM) for durable storage and Redis for sessions and rate limiting. No frontend.

## Stack

- **Runtime:** Bun
- **HTTP:** Hono
- **Database:** Postgres via Drizzle ORM (`drizzle-orm/bun-sql`)
- **Sessions / rate limiting:** Redis (Bun's built-in client, `import { redis } from "bun"`)
- **Validation:** Zod (`@hono/zod-validator`)
- **Passwords:** `Bun.password` (hashing)

## Setup

Install dependencies:

```bash
bun install
```

Set the required environment variables (Bun auto-loads `.env`):

| Variable       | Purpose                                  |
| -------------- | ---------------------------------------- |
| `DATABASE_URL` | Postgres connection string               |
| `REDIS_URL`    | Redis connection string                  |
| `NODE_ENV`     | `production` enables secure cookies       |

Apply the schema to your database:

```bash
bun run migrate    # drizzle-kit push
```

## Running

```bash
bun run dev        # hot-reloading server (src/index.ts)
bun run database   # open Drizzle Studio
bun test           # run tests
```

Bun serves the default export from `src/index.ts` directly — there is no `Bun.serve()` call.

## API

| Method | Path             | Description                                    |
| ------ | ---------------- | ---------------------------------------------- |
| `GET`  | `/health`        | Health check — returns `{ status: "OK" }`      |
| `POST` | `/auth/register` | Create an account, open a session              |
| `POST` | `/auth/login`    | _Stub — not yet implemented_                   |
| `POST` | `/auth/logout`   | _Stub — not yet implemented_                   |
| `GET`  | `/auth/me`       | _Stub — not yet implemented_                   |

### `POST /auth/register`

Rate limited per IP (see below). Request body:

```json
{
  "email": "user@example.com",
  "password": "at-least-8-chars",
  "handle": "alphanum_underscore",
  "displayName": "Display Name"
}
```

Validation (Zod):

- `email` — valid email address
- `password` — 8–128 characters
- `handle` — 3–32 chars, letters/numbers/underscores only, unique
- `displayName` — 1–64 characters

On success (`201`) a `session` cookie is set and the new user is returned:

```json
{
  "user": { "id": "…", "email": "user@example.com" },
  "message": "Account created",
  "action": "Check your email to verify your account"
}
```

Other responses: `400` with field-level errors on validation failure, `409` when the account can't be created, `429` when rate limited.

> To avoid leaking which emails are registered, the `409` response uses a deliberately generic message (`"Incorrect email or password"`) rather than confirming the email is already taken.

> Email verification is currently a stub (`sendVerificationEmail` logs to the console; a TODO tracks wiring up a real sender).

## Sessions & rate limiting

- Sessions are stored both in Postgres (`sessions` table) and Redis (`session:<id>`), expiring after **7 days**. The session ID is set as an `httpOnly`, `SameSite=Lax` cookie named `session` (`secure` in production).
- Account creation is rate limited to **5 requests per IP per 30 minutes** via Redis (`ratelimit:<ip>`).

These TTLs and cookie options live in [`src/config.ts`](src/config.ts).

## Project layout

```
src/
  index.ts            # app wiring + default export (Bun serves it)
  config.ts           # env-derived constants, cookie options
  db/
    index.ts          # Drizzle connection (bun-sql)
    schema.ts         # users, profiles, sessions tables
  middleware/
    rate-limit.ts     # per-IP Redis rate limiter
  auth/
    schema.ts         # Zod request schemas
    service.ts        # auth business logic (registration, sessions)
    route.ts          # thin Hono handlers
```

Routes stay thin: a handler validates input, calls a service function, and shapes the response. Business logic and DB/Redis access live in `*/service.ts`; services return result objects and let routes map them to status codes.
</content>
</invoke>
