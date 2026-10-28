// Session limits
export const COOKIE_NAME = "session";
export const SESSION_TTL_SECONDS = 60 * 60; // 1 hour

// Auth limits (25 ops per 30 minutes)
export const AUTH_OPS_LIMIT = 25; // 5 accounts per
export const AUTH_RATE_LIMIT_SECONDS = 60 * 30; // 30 minutes

// Set TRUST_PROXY=true only when running behind a reverse proxy that sets
// X-Forwarded-For; otherwise clients could spoof their rate-limit key.
export const TRUST_PROXY = process.env.TRUST_PROXY === "true";

export const PROBE_TIMEOUT_MS = 2000;

// Cookie Settings
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
