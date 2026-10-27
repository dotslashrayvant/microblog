import { Hono } from "hono";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";

import { auth } from "@/auth/route";
import { users } from "@/users/route";
import { posts } from "@/posts/route";
import { feed } from "@/feed/route";
import healthCheck from "@/health";

const app = new Hono().basePath("/api/v1");
app.use(logger());
app.use(prettyJSON());

app.route("/auth", auth);
app.route("/users", users);
app.route("/posts", posts);
app.route("/feed", feed);

app.get("/health", healthCheck);

export default app;
