import { expect, test } from "bun:test";

import { api } from "./helpers";

test("GET /health reports both backing services up", async () => {
  const res = await api("GET", "/health");

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    status: "up",
    services: {
      database: { status: "up", latency_ms: expect.any(Number) },
      redis: { status: "up", latency_ms: expect.any(Number) },
    },
  });
});
