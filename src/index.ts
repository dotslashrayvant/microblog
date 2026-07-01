import { Hono } from "hono";
import { logger } from "hono/logger";

import { auth } from "./auth/route";
import { users } from "./users/route";

const app = new Hono();

app.use(logger());
app.route("/auth", auth);
app.route("/users", users);
app.get("/health", (c) => c.json({ status: "OK" }));

export default app;
