import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { COOKIE_NAME } from "../config";
import { getSession } from "../auth/service";

export const verifySession = createMiddleware<{
  Variables: { userId: string };
}>(async (c, next) => {
  const sessionId = getCookie(c, COOKIE_NAME);
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401);

  const userId = await getSession(sessionId);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);

  c.set("userId", userId);
  await next();
});
