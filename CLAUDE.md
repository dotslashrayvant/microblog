# microblog

A microblogging JSON API on Bun + Hono, with Postgres (Drizzle ORM, `drizzle-orm/bun-sql`) for storage and Redis for sessions and rate limiting. No frontend.

## Structure & conventions

```
src/
  index.ts            # app wiring + default export (Bun serves it — no Bun.serve() call needed)
  config.ts           # env-derived constants, cookie options
  db/                 # Drizzle connection (index.ts) + schema (schema.ts)
  middleware/         # reusable Hono middleware (e.g. rate-limit.ts)
  auth/
    schema.ts         # Zod request schemas
    service.ts        # auth business logic (registration, sessions, tokens)
    route.ts          # thin Hono handlers
```

- **Keep routes thin:** a handler validates input, calls a service function, shapes the response. Business logic and DB/Redis access belong in `*/service.ts`, not in handlers.
- **Services speak the domain, not HTTP** — return result objects (e.g. `{ ok: false, reason: "conflict" }`) and let the route map them to status codes.
- **Shared constants live in `config.ts`** (TTLs, cookie options) — don't redefine them per file.
- Run with `bun run dev`; apply migrations with `bun run migrate`.

## General Bun rules

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- This project routes through **Hono**, not raw `Bun.serve()` routes. Don't use `express`.
- `Bun.sql` for Postgres (used here via Drizzle's `bun-sql` adapter). Don't use `pg` or `postgres.js`.
- `Bun.redis` for Redis (imported as `import { redis } from "bun"`). Don't use `ioredis`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
