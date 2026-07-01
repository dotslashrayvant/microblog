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

| Method   | Path                                 | Description                                       |
| -------- | ------------------------------------ | ------------------------------------------------- |
| `GET`    | `/health`                            | Health check — returns `{ status: "OK" }`         |
| `POST`   | `/auth/register`                     | Create an account, open a session                 |
| `POST`   | `/auth/login`                        | Authenticate, open a session                      |
| `POST`   | `/auth/logout`                       | End the session, clear the cookie                 |
| `GET`    | `/users/me`                          | Authenticated user's own profile (private fields) |
| `PATCH`  | `/users/me`                          | Update the authenticated user's profile           |
| `GET`    | `/users/:id`                         | Public profile by user ID                         |
| `GET`    | `/users/:id/posts`                   | Posts by user ID, newest first (paginated)        |
| `GET`    | `/users/by/username/:username`       | Public profile by username                        |
| `GET`    | `/users/by/username/:username/posts` | Posts by username, newest first (paginated)       |
| `POST`   | `/posts`                             | Create a post (or a reply via `parentId`)         |
| `GET`    | `/posts/:id`                         | Public post by ID                                 |
| `PATCH`  | `/posts/:id`                         | Edit your own post                                |
| `DELETE` | `/posts/:id`                         | Delete your own post (cascades to replies)        |
| `POST`   | `/posts/:id/reply`                   | Reply to a post                                   |

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

### `GET /users/me`

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

### `GET /users/:id/posts`

Posts authored by the user, **newest first**. Public. `:id` must be a UUID (`400` otherwise); `404` when no user matches. Paginate with query params:

- `limit` — 1–100, default `20`
- `offset` — ≥ 0, default `0`

On success (`200`) — an array of posts, each using the shape from [`POST /posts`](#post-posts):

```json
{
  "posts": [
    {
      "id": "uuid",
      "content": "hello world",
      "parentId": null,
      "authorId": "uuid",
      "username": "alphanum_underscore",
      "displayName": "Display Name",
      "createdAt": "2026-07-01T08:05:14.876Z",
      "updatedAt": "2026-07-01T08:05:14.876Z"
    }
  ]
}
```

### `GET /users/by/username/:username`

Public lookup by username — same response shape as `GET /users/:id`. `:username` is validated against the same username rules (3–32 chars, letters/numbers/underscores); `400` otherwise, `404` when no user matches.

### `GET /users/by/username/:username/posts`

Same as `GET /users/:id/posts`, but resolves the author by username. `:username` follows the username rules; `400` on a malformed handle, `404` when no user matches. Identical `limit` / `offset` pagination and response shape.

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

### `POST /posts`

Create a post. Requires a valid `session` cookie (`401` otherwise). Request body:

```json
{
  "content": "hello world",
  "parentId": "uuid — optional"
}
```

Validation (Zod):

- `content` — 1–280 characters
- `parentId` — optional; UUID of the post this one replies to

On success (`201`) the created post is returned with the author's `username` / `displayName` embedded:

```json
{
  "post": {
    "id": "uuid",
    "content": "hello world",
    "parentId": null,
    "authorId": "uuid",
    "username": "alphanum_underscore",
    "displayName": "Display Name",
    "createdAt": "2026-07-01T08:05:14.876Z",
    "updatedAt": "2026-07-01T08:05:14.876Z"
  }
}
```

Other responses: `400` on validation failure, `401` without a session, `404` when `parentId` points at a post that doesn't exist.

### `GET /posts/:id`

Public lookup by post ID. `:id` must be a UUID (`400` otherwise). Returns the post in the same shape as `POST /posts` (author embedded). `404` when no post matches.

### `PATCH /posts/:id`

Edit your own post's content. Requires a valid `session` cookie. `:id` must be a UUID. Request body:

```json
{ "content": "edited text" }
```

Validation: `content` — 1–280 characters. On success (`200`) the updated post is returned (with a refreshed `updatedAt`). Other responses: `400` on validation failure, `401` without a session, `403` when the post belongs to another user, `404` when it doesn't exist.

### `DELETE /posts/:id`

Delete your own post. Requires a valid `session` cookie. `:id` must be a UUID. Deleting a post **cascades to its replies** (any post whose `parentId` points at it). On success (`200`):

```json
{ "success": true }
```

Other responses: `401` without a session, `403` when the post belongs to another user, `404` when it doesn't exist.

### `POST /posts/:id/reply`

Create a reply whose parent is `:id` — a convenience for `POST /posts` with `parentId` taken from the path. Requires a valid `session` cookie. Request body:

```json
{ "content": "a reply" }
```

Validation: `content` — 1–280 characters. On success (`201`) the created reply is returned with `parentId` set to `:id`. Other responses: `400` on validation failure, `401` without a session, `404` when the parent post doesn't exist.

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
    schema.ts         # users, profiles, posts tables
  middleware/
    rate-limit.ts     # per-IP Redis rate limiter
    verify-session.ts # session guard — sets userId on the context
  auth/
    schema.ts         # Zod request schemas
    service.ts        # auth business logic (registration, login, sessions)
    route.ts          # thin Hono handlers
  users/
    schema.ts         # Zod request schemas
    service.ts        # profile lookups (public + self) + updates
    route.ts          # thin Hono handlers (also lists a user's posts)
  posts/
    schema.ts         # Zod request schemas
    service.ts        # post create/read/edit/delete + author listings
    route.ts          # thin Hono handlers
```

Routes stay thin: a handler validates input, calls a service function, and shapes the response. Business logic and DB/Redis access live in `*/service.ts`; services return result objects and let routes map them to status codes.
