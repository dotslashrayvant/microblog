FROM oven/bun:1.4.4
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./

ENV NODE_ENV=production
EXPOSE 3000

# Drop root; the base image ships an unprivileged "bun" user.
USER bun

# No curl/wget in the image, so probe /health with Bun's fetch (503 = unhealthy).
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=5 \
  CMD ["bun", "-e", "fetch('http://localhost:3000/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Bun serves the app's default export; no build step needed.
CMD ["bun", "src/index.ts"]
