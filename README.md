<div align="center">

# microblog

**A production-minded microblogging JSON API — built on Bun, Hono, PostgreSQL, and Redis.**

Feature-sliced architecture · timing-safe authentication · fully typed from request to query.

[![Bun](https://img.shields.io/badge/Bun-1.3+-000000?style=flat-square&logo=bun&logoColor=white)](https://bun.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Hono](https://img.shields.io/badge/Hono-4.x-E36002?style=flat-square&logo=hono&logoColor=white)](https://hono.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle_ORM-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://orm.drizzle.team)
[![Redis](https://img.shields.io/badge/Redis-sessions_&_rate_limiting-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=flat-square)](LICENSE)

</div>

---

`microblog` is a JSON API for a Twitter-style social service — accounts, profiles, posts, threaded replies, likes, and reposts. It has **no frontend**; it is a focused backend built to demonstrate production-grade API design: a strict layered architecture, security-conscious authentication, and an end-to-end type-safe request pipeline on the Bun runtime.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Security](#security)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Features

**Accounts & sessions**
- 🔐 Register / login / logout with opaque, server-side sessions stored in Redis
- 🪪 Self profile (`/users/me`) with private fields, plus public profile lookups by id or username
- ✏️ Partial profile updates with explicit "set vs. clear" semantics

**Social graph**
- 📝 Posts with full CRUD and ownership enforcement
- 💬 Threaded replies via a self-referential `parent_id`
- ❤️ Idempotent likes and 🔁 reposts modeled as composite-keyed join tables
- 📚 Paginated, newest-first listings: a user's posts, a user's liked posts, and a post's likers

**Engineering**
- 🧱 Feature-sliced, three-layer architecture with an enforced route → service → schema boundary
- 🧩 Every request validated at the edge with [Zod](https://zod.dev); services return typed result objects, routes own HTTP status
- 🛡️ Strict TypeScript (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) — the whole path from HTTP body to SQL row is typed
- ⚡ Bun-native throughout: `Bun.password`, `Bun.redis`, and `Bun.sql` (via Drizzle's `bun-sql` adapter) — no `dotenv`, `pg`, `ioredis`, or `bcrypt`

## Tech Stack

| Layer            | Choice                                                      | Why                                                                    |
| ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Runtime          | [Bun](https://bun.com) 1.3+                                 | Fast startup, native TS, built-in `.env`, password, SQL & Redis clients |
| HTTP framework   | [Hono](https://hono.dev)                                    | Tiny, fast, first-class TypeScript, ergonomic middleware              |
| Database         | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team) (`bun-sql`) | Type-safe SQL, zero-codegen inference, parameterized queries          |
| Cache / sessions | Redis (`Bun.redis`)                                         | Sub-ms session lookups and atomic rate-limit counters                 |
| Validation       | [Zod](https://zod.dev) + `@hono/zod-validator`             | One schema → runtime validation **and** inferred static types         |
| Passwords        | `Bun.password` (argon2id)                                  | Memory-hard, salted hashing with no extra dependency                  |

## Architecture

Every feature (`auth`, `users`, `posts`) is split into three files, and the boundary between them is deliberately strict:

| File          | Responsibility                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `route.ts`    | Thin Hono handlers — validate input, call one service function, map its result to a status code. No business logic, no DB access. |
| `service.ts`  | Domain logic and **all** Postgres/Redis access. Returns plain result objects (`{ ok: false, code: 409 }`), never HTTP responses. |
| `schema.ts`   | Zod request schemas and the types inferred from them (`z.infer`).                                |

This keeps handlers boring and declarative, makes the business logic trivial to test in isolation, and means the HTTP layer is the *only* place that knows about status codes.

```mermaid
flowchart TD
    A([Client]) -->|JSON request| B[Hono router]
    B --> C[Middleware<br/>rate limit · session guard]
    C --> D[route.ts<br/>validate input · map status codes]
    D --> E[service.ts<br/>domain logic · data access]
    E --> F[(PostgreSQL<br/>Drizzle ORM)]
    E --> G[(Redis<br/>sessions · rate limits)]
    E -.->|result object| D
    D -.->|JSON response| A
```

The app is composed in `src/index.ts` and exposed as the module's default export — Bun serves it directly, so there is no `Bun.serve()` call.

## Data Model

Five tables. Profiles are 1:1 with users; posts self-reference for replies; likes and reposts are join tables whose composite primary key guarantees one row per `(user, post)`. Every foreign key is `ON DELETE CASCADE`, so removing a user or post automatically cleans up its profile, replies, likes, and reposts.

```mermaid
erDiagram
    users ||--|| profiles : has
    users ||--o{ posts : authors
    posts ||--o{ posts : "reply to (parent_id)"
    users ||--o{ likes : likes
    posts ||--o{ likes : receives
    users ||--o{ reposts : reposts
    posts ||--o{ reposts : receives

    users {
        uuid id PK
        varchar email UK
        text password_hash
        boolean email_verified
        timestamp created_at
    }
    profiles {
        uuid user_id PK, FK
        varchar username UK
        varchar display_name
        text bio "nullable"
        date birth_date "nullable"
    }
    posts {
        uuid id PK
        uuid author_id FK
        uuid parent_id FK "nullable"
        text content
        timestamp created_at
    }
    likes {
        uuid user_id PK, FK
        uuid post_id PK, FK
        timestamp created_at
    }
    reposts {
        uuid user_id PK, FK
        uuid post_id PK, FK
        timestamp created_at
    }
```

## Project Structure

```
src/
├── index.ts              # App composition + default export (Bun serves it)
├── config.ts             # Shared constants: session/rate-limit TTLs, cookie options
├── db/
│   ├── index.ts          # Drizzle client (drizzle-orm/bun-sql)
│   └── schema.ts         # Tables: users, profiles, posts, likes, reposts
├── middleware/
│   ├── rate-limit.ts     # Per-IP fixed-window limiter (Redis)
│   └── verify-session.ts # Session guard → sets userId on the context
├── auth/                 # Register · login · logout
│   ├── route.ts · service.ts · schema.ts
├── users/                # Profiles · post & liked-post listings
│   ├── route.ts · service.ts · schema.ts
└── posts/                # Posts · replies · likes · reposts
    └── route.ts · service.ts · schema.ts
```

## Getting Started

### Prerequisites

- [Bun](https://bun.com) **1.3+**
- A **PostgreSQL** database
- A **Redis** instance

### Installation

```bash
git clone https://github.com/dotslashrayvant/microblog.git
cd microblog
bun install
```

### Environment

Bun auto-loads `.env` — no `dotenv` needed. Create one in the project root:

```dotenv
# .env
DATABASE_URL=postgres://user:password@localhost:5432/microblog
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

### Database

Push the schema to your database (Drizzle Kit, no migration files generated):

```bash
bun run migrate       # drizzle-kit push
bun run database      # optional: open Drizzle Studio to inspect data
```

### Run

```bash
bun run dev           # hot-reloading server on http://localhost:3000
```

### Quickstart

```bash
# 1 — Register; save the session cookie to cookies.txt
curl -s -c cookies.txt -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ada@example.com","password":"correct-horse-battery","username":"ada","displayName":"Ada Lovelace"}'

# 2 — Create a post; send the cookie back
curl -s -b cookies.txt -X POST http://localhost:3000/posts \
  -H 'Content-Type: application/json' \
  -d '{"content":"hello, microblog 👋"}'

# 3 — Like it (swap in the id from step 2)
curl -s -b cookies.txt -X POST http://localhost:3000/posts/<POST_ID>/like
```

## Configuration

Runtime behavior is controlled by environment variables and a handful of constants in [`src/config.ts`](src/config.ts).

**Environment variables**

| Variable       | Required | Description                                       |
| -------------- | :------: | ------------------------------------------------- |
| `DATABASE_URL` |    ✅    | PostgreSQL connection string                      |
| `REDIS_URL`    |    ✅    | Redis connection string                           |
| `NODE_ENV`     |    —     | `production` sets the `Secure` flag on cookies    |

**Tunable constants** ([`src/config.ts`](src/config.ts))

| Constant                  | Default        | Purpose                                        |
| ------------------------- | -------------- | ---------------------------------------------- |
| `SESSION_TTL_SECONDS`     | `3600` (1h)    | Session lifetime in Redis and cookie `Max-Age` |
| `AUTH_OPS_LIMIT`          | `25`           | Auth requests allowed per window, per IP       |
| `AUTH_RATE_LIMIT_SECONDS` | `1800` (30m)   | Rate-limit window length                       |

## API Reference

### Conventions

- **Base URL** — `http://localhost:3000`
- **Auth** — protected routes require the `session` cookie returned by `/auth/register` or `/auth/login` (`httpOnly`, so it's sent automatically by browsers).
- **Content type** — request bodies are `application/json`.
- **Pagination** — list endpoints accept `?limit=` (1–100, default `20`) and `?offset=` (default `0`), and return results newest-first.
- **Errors** — a business error is `{ "error": "message" }`; a validation error (`400`) is `{ "error": [{ "field": "...", "message": "..." }] }`.

### Endpoints

**Auth**

| Method | Path             | Auth | Description                          |
| ------ | ---------------- | :--: | ------------------------------------ |
| `POST` | `/auth/register` |  —   | Create an account, open a session    |
| `POST` | `/auth/login`    |  —   | Authenticate, open a session         |
| `POST` | `/auth/logout`   |  —   | End the session, clear the cookie    |

> Register and login are rate limited per IP (see [Configuration](#configuration)).

**Users**

| Method  | Path                                        | Auth | Description                               |
| ------- | ------------------------------------------- | :--: | ----------------------------------------- |
| `GET`   | `/users/me`                                 |  ✅  | Own profile, including private fields     |
| `PATCH` | `/users/me`                                 |  ✅  | Update own profile (partial)              |
| `GET`   | `/users/:id`                                |  —   | Public profile by user id                 |
| `GET`   | `/users/by/username/:username`              |  —   | Public profile by username                |
| `GET`   | `/users/:id/posts`                          |  —   | Posts by user id                          |
| `GET`   | `/users/by/username/:username/posts`        |  —   | Posts by username                         |
| `GET`   | `/users/:id/liked_posts`                    |  —   | Posts liked by user id                    |
| `GET`   | `/users/by/username/:username/liked_posts`  |  —   | Posts liked by username                   |

**Posts**

| Method   | Path               | Auth | Description                                  |
| -------- | ------------------ | :--: | -------------------------------------------- |
| `POST`   | `/posts`           |  ✅  | Create a post (or a reply via `parentId`)    |
| `GET`    | `/posts/:id`       |  —   | Fetch a post (author embedded)               |
| `PATCH`  | `/posts/:id`       |  ✅  | Edit your own post                           |
| `DELETE` | `/posts/:id`       |  ✅  | Delete your own post (cascades to replies)   |
| `POST`   | `/posts/:id/reply` |  ✅  | Reply to a post                              |

**Engagement**

| Method   | Path                      | Auth | Description                             |
| -------- | ------------------------- | :--: | --------------------------------------- |
| `POST`   | `/posts/:id/like`         |  ✅  | Like a post (idempotent)                |
| `DELETE` | `/posts/:id/like`         |  ✅  | Remove your like (idempotent)           |
| `POST`   | `/posts/:id/repost`       |  ✅  | Repost a post (idempotent)              |
| `DELETE` | `/posts/:id/repost`       |  ✅  | Remove your repost (idempotent)         |
| `GET`    | `/posts/:id/liking_users` |  —   | Users who liked a post                  |

> Utility: `GET /health` → `{ "status": "OK" }`.

<details>
<summary><b>Example — register &amp; create a post</b></summary>

```http
POST /auth/register
Content-Type: application/json

{ "email": "ada@example.com", "password": "correct-horse-battery",
  "username": "ada", "displayName": "Ada Lovelace" }
```
```json
201 Created
Set-Cookie: session=<uuid>; HttpOnly; SameSite=Lax; Path=/
{ "success": true }
```
```http
POST /posts
Cookie: session=<uuid>
Content-Type: application/json

{ "content": "hello, microblog" }
```
```json
201 Created
{
  "post": {
    "id": "b1f2…", "content": "hello, microblog",
    "parentId": null, "authorId": "a0c9…",
    "username": "ada", "displayName": "Ada Lovelace",
    "createdAt": "2026-07-01T12:00:00.000Z",
    "updatedAt": "2026-07-01T12:00:00.000Z"
  }
}
```
</details>

<details>
<summary><b>Example — a validation error (400)</b></summary>

```http
POST /posts
Cookie: session=<uuid>
Content-Type: application/json

{ "content": "" }
```
```json
400 Bad Request
{ "error": [{ "field": "content", "message": "Too small: expected string to have >=1 characters" }] }
```
</details>

## Security

Security is treated as a first-class design constraint, not an afterthought:

- **Password hashing** — argon2id via `Bun.password.hash` (memory-hard, per-hash salt). Plaintext is never stored or logged.
- **Timing-safe login** — `Bun.password.verify` always runs, against a dummy hash when the email is unknown, so response time can't reveal whether an account exists. The `401` message is intentionally generic.
- **Opaque sessions** — random UUID session ids in Redis with a 1-hour TTL, delivered as an `httpOnly`, `SameSite=Lax`, `Secure`-in-production cookie. No client-readable tokens to exfiltrate.
- **Per-IP rate limiting** — a Redis fixed-window limiter on auth endpoints (25 requests / 30 min) blunts credential stuffing and brute force.
- **Validation at the edge** — every body, path param, and query string is parsed by Zod before a handler runs; malformed input never reaches the service layer.
- **Injection-safe queries** — all database access goes through Drizzle's parameterized query builder; no string-concatenated SQL.
- **Minimal disclosure** — registration failures return a single generic message regardless of cause, closing account-enumeration vectors.
- **Referential integrity** — `ON DELETE CASCADE` foreign keys keep replies, likes, and reposts consistent when a post or user is deleted.

## Testing

An end-to-end smoke test in [`scripts/smoke-test.sh`](scripts/smoke-test.sh) exercises the entire API surface — **65 checks** covering the happy paths plus auth guards, ownership rules, validation, pagination, idempotency, and cascade behavior. It doubles as executable, always-current documentation of the contract.

```bash
# Requires: curl, jq
BUN_PORT=3737 bun run dev &                          # start the API
./scripts/smoke-test.sh http://localhost:3737        # run the suite
```

The script provisions throwaway accounts per run, so it is safe to run repeatedly against a dev database.

## Roadmap

- [ ] Email verification — the `sendVerificationEmail` hook is stubbed; a Kafka-backed sender is planned
- [ ] Like / repost **counts** on post payloads
- [ ] Repost listing endpoints (`reposting_users`, `reposted_posts`)
- [ ] Cursor-based pagination for large feeds
- [ ] Rate limiting on write endpoints
- [ ] Unit & integration tests (`bun:test`) with CI on GitHub Actions
- [ ] OpenAPI specification and a `Dockerfile` / compose setup

## Contributing

Issues and pull requests are welcome. Please keep changes within the established route → service → schema boundary, run `bunx tsc --noEmit` and the smoke test before opening a PR, and match the surrounding style.

---

<div align="center">
Built with ❤️ by <a href="https://github.com/dotslashrayvant">Rayvant</a>
</div>
