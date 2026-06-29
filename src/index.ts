import { Hono } from "hono";
import { auth } from "./auth";

const app = new Hono();

app.route("/auth", auth);
app.get("/health", (c) => c.json({ status: "OK" }));

export default app;
