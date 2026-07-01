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

| Method  | Path                           | Description                                       |
| ------- | ------------------------------ | ------------------------------------------------- |
| `GET`   | `/health`                      | Health check — returns `{ status: "OK" }`         |
| `POST`  | `/auth/register`               | Create an account, open a session                 |
| `POST`  | `/auth/login`                  | Authenticate, open a session                      |
| `POST`  | `/auth/logout`                 | End the session, clear the cookie                 |
| `GET`   | `/auth/me`                     | Authenticated user's own profile (private fields) |
| `GET`   | `/users/:id`                   | Public profile by user ID                         |
| `GET`   | `/users/by/username/:username` | Public profile by username                        |
| `PATCH` | `/users/me`                    | Update the authenticated user's profile           |

### `POST /auth/register`

Rate limited per IP (see below). Request body:

```json
{
  "email": "user@example.com",
  "password": "at-least-8-chars",
  "username": "alphanum_underscore",
  "displayName": "Display Name"
}
```

Validation (Zod):

- `email` — valid email address
- `password` — 8–128 characters
- `username` — 3–32 chars, letters/numbers/underscores only, unique
- `displayName` — 1–64 characters

On success (`201`) a `session` cookie is set:

```json
{ "success": true }
```

Other responses: `400` with field-level errors on validation failure, `409` when the account already exists, `500` on a database error, `429` when rate limited. Failure responses use a generic `"Registration failed"` message.

> Email verification is currently a stub (`sendVerificationEmail` logs to the console; a TODO tracks wiring up a real sender).

### `POST /auth/login`

Rate limited per IP (see below). Request body:

```json
{
  "email": "user@example.com",
  "password": "user-password"
}
```

On success (`200`) a `session` cookie is set:

```json
{ "success": true }
```

Other responses: `400` with field-level errors on validation failure, `401` on bad credentials, `429` when rate limited.

> To avoid leaking which emails are registered, the `401` response uses a deliberately generic message (`"Incorrect email or password"`). Login also verifies against a dummy hash when no user matches, so response timing doesn't reveal whether an email exists.

### `POST /auth/logout`

Deletes the session from Redis and clears the `session` cookie. Safe to call without a session; always returns `200`:

```json
{ "success": true }
```

### `GET /auth/me`

Returns the authenticated user's **own** profile, including private fields (`email`, `emailVerified`). Requires a valid `session` cookie — `401` otherwise.

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": false,
    "createdAt": "2026-07-01T08:05:14.876Z",
    "username": "alphanum_underscore",
    "displayName": "Display Name",
    "bio": null,
    "birthDate": null
  }
}
```

### `GET /users/:id`

Public lookup by user ID. `:id` must be a UUID (`400` otherwise). Returns the **public** profile — `email` / `emailVerified` are never included:

```json
{
  "user": {
    "id": "uuid",
    "username": "alphanum_underscore",
    "displayName": "Display Name",
    "bio": null,
    "birthDate": null,
    "createdAt": "2026-07-01T08:05:14.876Z"
  }
}
```

Returns `404` when no user matches.

### `GET /users/by/username/:username`

Public lookup by username — same response shape as `GET /users/:id`. `:username` is validated against the same username rules (3–32 chars, letters/numbers/underscores); `400` otherwise, `404` when no user matches.

### `PATCH /users/me`

Update the authenticated user's profile. Requires a valid `session` cookie (`401` otherwise). Request body — all fields optional, but at least one must be present:

```json
{
  "displayName": "New Name",
  "bio": "hello world",
  "birthDate": "1990-01-01"
}
```

Validation (Zod):

- `displayName` — 1–64 characters
- `bio` — up to 500 characters, or `null` to clear
- `birthDate` — ISO date (`YYYY-MM-DD`), or `null` to clear

An omitted field is left unchanged; sending `null` clears an optional field. On success (`200`) the updated profile is returned:

```json
{
  "user": {
    "id": "uuid",
    "username": "alphanum_underscore",
    "displayName": "New Name",
    "bio": "hello world",
    "birthDate": "1990-01-01"
  }
}
```

Other responses: `400` with field-level errors on validation failure (including an empty body), `404` if the profile no longer exists.

## Sessions & rate limiting

- Sessions are stored in Redis (`session:<id>`), expiring after **1 hour**. The session ID is set as an `httpOnly`, `SameSite=Lax` cookie named `session` (`secure` in production).
- Auth endpoints (register and login) are rate limited to **25 requests per IP per 30 minutes** via Redis (`ratelimit:<ip>`).

These TTLs and cookie options live in [`src/config.ts`](src/config.ts).

## Project layout

```
src/
  index.ts            # app wiring + default export (Bun serves it)
  config.ts           # env-derived constants, cookie options
  db/
    index.ts          # Drizzle connection (bun-sql)
    schema.ts         # users, profiles tables
  middleware/
    rate-limit.ts     # per-IP Redis rate limiter
    verify-session.ts # session guard — sets userId on the context
  auth/
    schema.ts         # Zod request schemas
    service.ts        # auth business logic (registration, login, sessions)
    route.ts          # thin Hono handlers
  users/
    schema.ts         # Zod request schemas
    service.ts        # profile lookups + updates
    route.ts          # thin Hono handlers
```

Routes stay thin: a handler validates input, calls a service function, and shapes the response. Business logic and DB/Redis access live in `*/service.ts`; services return result objects and let routes map them to status codes.
