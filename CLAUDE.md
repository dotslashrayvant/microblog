# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A microblogging JSON API on **Bun + Hono**, with Postgres (Drizzle ORM via `drizzle-orm/bun-sql`) for storage and Redis for sessions and rate limiting. No frontend. Implemented features: auth (register/login/logout), user profiles (`src/users/`), and posts with replies, likes, and reposts (`src/posts/`). The full endpoint list lives in README.md — keep it in sync when adding routes.

## Commands

```bash
bun install          # install dependencies
bun run dev          # hot-reloading server (src/index.ts); BUN_PORT=3737 to change port
bun run migrate      # push schema to DB (drizzle-kit push)
bun run database     # open Drizzle Studio
bun test             # run tests (bun:test); single test: bun test path/to/file.test.ts -t "name"
./scripts/smoke-test.sh [BASE_URL]   # curl/jq smoke test against a running dev server
```

There are no `*.test.ts` files yet — the smoke-test script is the only automated check.

Required env vars (Bun auto-loads `.env`): `DATABASE_URL` (Postgres), `REDIS_URL` (Redis), `NODE_ENV` (`production` enables `secure` cookies).

## Architecture

Per feature (`src/auth/`, `src/users/`, `src/posts/`), code splits three ways and the boundary is enforced:

- **`route.ts`** — thin Hono handlers. Validate input (`zValidator` against a schema), call a service function, map its result to a status code. No business logic, no DB/Redis access. Validation failures use a shared 400 shape: `{ error: [{ field, message }] }`.
- **`service.ts`** — domain logic and all DB/Redis access. Functions return plain **result objects** (e.g. `{ ok: false, code: 409 }`), never HTTP responses — the route decides the status.
- **`schema.ts`** — Zod request schemas + inferred types (`z.infer`).

Other structure: `src/index.ts` wires the app and `export default app` (Bun serves the default export — there is **no `Bun.serve()` call**); `src/config.ts` holds shared constants (session/rate-limit TTLs, `cookieOptions`) — don't redefine these per file; `src/db/` has the Drizzle connection and `schema.ts` (table definitions); `src/middleware/` holds reusable Hono middleware (`rateLimit`, `verifySession`).

### Auth conventions (security-sensitive — preserve these)

- **Registration** inserts `users` + `profiles` in one `db.transaction`. Failure responses use a generic `"Registration failed"` message regardless of cause.
- **Login** always runs `Bun.password.verify` — against a dummy hash when no user matches — so response timing doesn't reveal whether an email is registered. The `401` message is deliberately generic (`"Incorrect email or password"`).
- Sessions live in Redis as `session:<uuid>` (1h TTL), returned as an `httpOnly`, `SameSite=Lax` cookie named `session`. Rate limiting is per-IP via `ratelimit:<ip>` (25 ops / 30 min), applied as the `rateLimit` middleware on auth routes.
- Protected routes use the `verifySession` middleware, which resolves the session cookie and sets `c.var.userId`; handlers never read the cookie themselves.

### Domain conventions

- The authenticated user's own profile is `GET/PATCH /users/me` (there is no `/auth/me`). `/users/me` routes are registered **before** `/users/:id` so `"me"` isn't parsed as an id.
- Post content is 1–280 chars (Zod `content` schema in `src/posts/schema.ts`). Replies are posts with a `parentId` (self-referential FK; deleting a post cascades to its reply subtree).
- Likes and reposts use composite `(userId, postId)` primary keys, making them **idempotent** — repeated like/repost or unlike/unrepost is a no-op success, not an error.
- List endpoints paginate with `limit` (1–100, default 20) / `offset` query params via `PostListQuerySchema`, newest-first.
- Ownership checks (edit/delete own post) live in the service and return `{ ok: false, code: 403 }`; missing resources return `code: 404`.

## Bun-specific rules (this is a Bun project, not Node)

- Use `bun <file>`, `bun test`, `bun install`, `bun run <script>`, `bunx <pkg>` — never the node/npm/yarn/pnpm/jest/vitest/ts-node equivalents. Don't add `dotenv` (Bun loads `.env`).
- Routing goes through **Hono** — don't introduce `express` or raw `Bun.serve()` routes.
- Use Bun's built-in clients: `Bun.sql` for Postgres (here via Drizzle's `bun-sql` adapter — don't add `pg` or `postgres.js`) and `Bun.redis` (`import { redis } from "bun"` — don't add `ioredis`).
- Prefer built-ins: `WebSocket` (not `ws`), `Bun.file` (not `node:fs`), `Bun.$` (not `execa`).

Bun API docs are vendored at `node_modules/bun-types/docs/**.mdx`.
