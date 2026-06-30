# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A microblogging JSON API on **Bun + Hono**, with Postgres (Drizzle ORM via `drizzle-orm/bun-sql`) for storage and Redis for sessions and rate limiting. No frontend. Early stage — only auth (register/login) is implemented; `/auth/logout` and `/auth/me` are empty stubs.

## Commands

```bash
bun install          # install dependencies
bun run dev          # hot-reloading server (src/index.ts)
bun run migrate      # push schema to DB (drizzle-kit push — no migration files generated)
bun run database     # open Drizzle Studio
bun test             # run tests (bun:test); single test: bun test path/to/file.test.ts -t "name"
```

Required env vars (Bun auto-loads `.env`): `DATABASE_URL` (Postgres), `REDIS_URL` (Redis), `NODE_ENV` (`production` enables `secure` cookies).

## Architecture

Per feature (e.g. `src/auth/`), code splits three ways and the boundary is enforced:

- **`route.ts`** — thin Hono handlers. Validate input (`zValidator` against a schema), call a service function, map its result to a status code. No business logic, no DB/Redis access.
- **`service.ts`** — domain logic and all DB/Redis access. Functions return plain **result objects** (e.g. `{ ok: false, code: 409 }`), never HTTP responses — the route decides the status.
- **`schema.ts`** — Zod request schemas + inferred types (`z.infer`).

Other structure: `src/index.ts` wires the app and `export default app` (Bun serves the default export — there is **no `Bun.serve()` call**); `src/config.ts` holds shared constants (session/rate-limit TTLs, `cookieOptions`) — don't redefine these per file; `src/db/` has the Drizzle connection and `schema.ts` (table definitions); `src/middleware/` holds reusable Hono middleware.

### Auth conventions (security-sensitive — preserve these)

- **Registration** inserts `users` + `profiles` in one `db.transaction`. Failure responses use a generic `"Registration failed"` message regardless of cause.
- **Login** always runs `Bun.password.verify` — against a dummy hash when no user matches — so response timing doesn't reveal whether an email is registered. The `401` message is deliberately generic (`"Incorrect email or password"`).
- Sessions live in Redis as `session:<uuid>` (1h TTL), returned as an `httpOnly`, `SameSite=Lax` cookie named `session`. Rate limiting is per-IP via `ratelimit:<ip>` (25 ops / 30 min), applied as the `rateLimit` middleware on auth routes.

## Bun-specific rules (this is a Bun project, not Node)

- Use `bun <file>`, `bun test`, `bun install`, `bun run <script>`, `bunx <pkg>` — never the node/npm/yarn/pnpm/jest/vitest/ts-node equivalents. Don't add `dotenv` (Bun loads `.env`).
- Routing goes through **Hono** — don't introduce `express` or raw `Bun.serve()` routes.
- Use Bun's built-in clients: `Bun.sql` for Postgres (here via Drizzle's `bun-sql` adapter — don't add `pg` or `postgres.js`) and `Bun.redis` (`import { redis } from "bun"` — don't add `ioredis`).
- Prefer built-ins: `WebSocket` (not `ws`), `Bun.file` (not `node:fs`), `Bun.$` (not `execa`).

Bun API docs are vendored at `node_modules/bun-types/docs/**.mdx`.
