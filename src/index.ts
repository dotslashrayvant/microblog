import { Hono } from "hono";
import { auth } from "./auth/route";
import { logger } from "hono/logger";

const app = new Hono();

app.use(logger());
app.route("/auth", auth);
app.get("/health", (c) => c.json({ status: "OK" }));

export default app;
