export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const VERIFICATION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
export const RATE_LIMIT_SECONDS = 60 * 30; // 30 minutes
export const RATE_LIMIT_ACC_CREATION = 5; // 5 accounts
export const COOKIE_NAME = "session";

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
