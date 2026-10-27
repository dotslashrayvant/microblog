# microblog

[![License: MIT](https://img.shields.io/github/license/dotslashrayvant/microblog?style=flat-square)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/dotslashrayvant/microblog?style=flat-square)](https://github.com/dotslashrayvant/microblog/commits/main)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white&style=flat-square)
![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white&style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white&style=flat-square)
![Drizzle](https://img.shields.io/badge/Drizzle-C5F74F?logo=drizzle&logoColor=black&style=flat-square)
![Redis](https://img.shields.io/badge/Redis-FF4438?logo=redis&logoColor=white&style=flat-square)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white&style=flat-square)

A microblogging JSON API built on [Bun](https://bun.sh) and [Hono](https://hono.dev), with Postgres (via [Drizzle ORM](https://orm.drizzle.team)) for storage and Redis for sessions and rate limiting. No frontend — just the API.

![End-to-end smoke test: 135 checks passing](assets/smoke-test.gif)

## Features

- **Auth** — cookie-based sessions: signup, login, logout
- **Users** — public profiles (lookup by id or username), own-profile view and editing
- **Posts** — create, read, edit, delete; threaded replies; likes and reposts
- **Social graph** — follow/unfollow, follower/following lists, and a home feed
- **Security** — hashed passwords, timing-safe login, per-IP rate limiting on auth routes

## Tech stack

| Layer      | Choice                                           |
| ---------- | ------------------------------------------------ |
| Runtime    | Bun                                              |
| Framework  | Hono                                             |
| Database   | Postgres via Drizzle ORM (`drizzle-orm/bun-sql`) |
| Sessions   | Redis (`Bun.redis`)                              |
| Validation | Zod + `@hono/zod-validator`                      |

## Getting started

### Quick start (Docker)

The whole stack — API, Postgres, and Redis, runs with one command:

```bash
docker compose up --build
```

Migrations are applied automatically, then the API is served on `http://localhost:3000/api/v1`. Try it:

```bash
./scripts/smoke-test.sh http://localhost:3000/api/v1
```

### Prerequisites (local dev)

- [Bun](https://bun.sh) v1.x
- A running Postgres instance
- A running Redis instance

### Setup

```bash
bun install
```

Create a `.env` file in the project root (Bun loads it automatically — no `dotenv` needed):

```env
DATABASE_URL=postgres://user:password@localhost:5432/microblog
REDIS_URL=redis://localhost:6379
NODE_ENV=development   # "production" enables secure cookies
```

Push the schema to the database, then start the dev server:

```bash
bun run db:push     # drizzle-kit push
bun run dev         # hot-reloading server (src/index.ts)
```

### Other commands

```bash
bun run db:view       # open Drizzle Studio
bun run db:generate   # generate a migration from schema changes
bun run db:migrate    # apply pending migrations
./scripts/smoke-test.sh   # end-to-end smoke test (needs the server running)
```

## API

All paths below are relative to the `/api/v1` base path (e.g. `POST /api/v1/auth/signup`). All request/response bodies are JSON. Validation errors return `400` with `{ "error": [{ "field", "message" }] }`.

Routes marked 🔒 require a valid `session` cookie (obtained via signup or login) and return `401` otherwise.

### Auth

| Method | Path           | Description                                  |
| ------ | -------------- | -------------------------------------------- |
| POST   | `/auth/signup` | Create an account + profile, start a session |
| POST   | `/auth/login`  | Authenticate, start a session                |
| POST   | `/auth/logout` | Destroy the session and clear the cookie     |

Signup and login are rate-limited per IP (25 requests / 30 min).

### Users

| Method | Path                                       | Description                                  |
| ------ | ------------------------------------------ | -------------------------------------------- |
| GET    | `/users/me`                                | 🔒 Own profile (includes email)              |
| PATCH  | `/users/me`                                | 🔒 Update own profile                        |
| GET    | `/users/:id`                               | Public profile by id                         |
| GET    | `/users/:id/posts`                         | Posts authored by a user, newest first       |
| GET    | `/users/:id/liked_posts`                   | Posts liked by a user, newest like first     |
| GET    | `/users/by/username/:username`             | Public profile by username                   |
| GET    | `/users/by/username/:username/posts`       | Posts authored by a username                 |
| GET    | `/users/by/username/:username/liked_posts` | Posts liked by a username                    |
| POST   | `/users/:id/follow`                        | 🔒 Follow a user (idempotent)                |
| DELETE | `/users/:id/follow`                        | 🔒 Unfollow a user (idempotent)              |
| GET    | `/users/:id/followers`                     | Users who follow a user, newest follow first |
| GET    | `/users/:id/following`                     | Users a user follows, newest follow first    |
| GET    | `/users/by/username/:username/followers`   | Followers of a username                      |
| GET    | `/users/by/username/:username/following`   | Users a username follows                     |

Profile responses include `followersCount` and `followingCount`. Following yourself returns `400`.

### Posts

| Method | Path                      | Description                                       |
| ------ | ------------------------- | ------------------------------------------------- |
| POST   | `/posts`                  | 🔒 Create a post (set `parentId` to make a reply) |
| GET    | `/posts/:id`              | Get a post                                        |
| PATCH  | `/posts/:id`              | 🔒 Edit own post (content only)                   |
| DELETE | `/posts/:id`              | 🔒 Delete own post (removes its reply subtree)    |
| POST   | `/posts/:id/reply`        | 🔒 Reply to a post                                |
| POST   | `/posts/:id/like`         | 🔒 Like a post (idempotent)                       |
| DELETE | `/posts/:id/like`         | 🔒 Remove a like (idempotent)                     |
| POST   | `/posts/:id/repost`       | 🔒 Repost a post (idempotent)                     |
| DELETE | `/posts/:id/repost`       | 🔒 Remove a repost (idempotent)                   |
| GET    | `/posts/:id/liking_users` | Users who liked a post, newest like first         |

Post content is 1–280 characters. List endpoints accept `?limit` (1–100, default 20) and `?offset` (default 0) query params.

### Feed

| Method | Path    | Description                                                             |
| ------ | ------- | ----------------------------------------------------------------------- |
| GET    | `/feed` | 🔒 Home timeline: posts from followed users plus your own, newest first |

Takes the same `?limit` / `?offset` params as the other list endpoints.

### Misc

| Method | Path      | Description                                                  |
| ------ | --------- | ------------------------------------------------------------ |
| GET    | `/health` | Postgres + Redis status and latency; `503` if either is down |

## Architecture

Each feature lives in its own directory under `src/` and splits three ways:

- **`route.ts`** — thin Hono handlers: validate input, call a service function, map its result to a status code. No business logic or DB access.
- **`service.ts`** — domain logic and all DB/Redis access. Functions return plain result objects (e.g. `{ ok: false, code: 404 }`), never HTTP responses.
- **`schema.ts`** — Zod request schemas and their inferred types.

```
src/
├── index.ts          # app wiring (/api/v1 base path); Bun serves the default export
├── config.ts         # shared constants (TTLs, cookie options, probe timeout)
├── health.ts         # /health handler: Postgres + Redis probes
├── auth/             # signup, login, logout, sessions
├── users/            # profiles, follows
├── posts/            # posts, replies, likes, reposts
├── feed/             # home timeline
├── database/         # Drizzle connection + table definitions
├── redis/            # Redis status probe
└── middleware/       # rateLimit, verifySession
```

### Data model

- `users` — credentials (unique email, password hash)
- `profiles` — one per user: unique username, display name, optional bio/birth date
- `posts` — self-referential `parentId` for replies; deleting a post cascades to its reply subtree
- `likes` / `reposts` — composite `(user, post)` primary keys make them idempotent
- `follows` — composite `(follower, followee)` primary key, self-follows blocked by a check constraint; drives the follower counts and the home feed

### Security notes

- Passwords are hashed with `Bun.password`. Login always runs a hash verification — against a dummy hash when no user matches — so response timing doesn't reveal whether an email is registered, and failures return a deliberately generic message.
- Sessions are stored in Redis (`session:<uuid>`, 1 hour TTL) and issued as an `httpOnly`, `SameSite=Lax` cookie. `secure` is enabled when `NODE_ENV=production`.

## License

See [LICENSE](LICENSE).
