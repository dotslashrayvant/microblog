import { Hono } from "hono";
const app = new Hono();

app.get("/health", (c) => c.json({ status: "OK" }));

export default app;
