import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuthFeature } from "../composition/features/create-auth-feature";
import { createLibsqlDb } from "../db/client";
import { registerAuthRoutes } from "./routes";

const origin = "http://localhost:8787";
let client: Client;
let app: Hono;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  const auth = createAuthFeature(createLibsqlDb(client), {
    baseURL: origin,
    trustedOrigins: [origin],
    secret: "a-long-test-secret-with-at-least-32-characters",
  }, [{
    id: "test-origin-checks",
    init: () => ({ context: { skipOriginCheck: false } }),
  }]);
  app = new Hono();
  registerAuthRoutes(app, auth.authHttpHandler, origin);
});
afterEach(() => client.close());

function request(path: string, body?: unknown, cookie?: string, method?: string) {
  return app.request(`${origin}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function cookies(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}

describe.each(["/api/auth", "/v1/auth"])("authentication via %s", (basePath) => {
  const otherPath = basePath === "/api/auth" ? "/v1/auth" : "/api/auth";

  it("shares accounts, session cookies, and sign-out across both paths", async () => {
    const signUp = await request(`${basePath}/sign-up/email`, {
      name: "Alias User", email: "alias@example.com", password: "test-password-123",
    });
    expect(signUp.status).toBe(200);
    const cookie = cookies(signUp);
    const session = await request(`${otherPath}/get-session`, undefined, cookie);
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email: "alias@example.com" } });
    expect((await request(`${otherPath}/sign-out`, {}, cookie)).status).toBe(200);
    expect(await (await request(`${basePath}/get-session`, undefined, cookie)).json()).toBeNull();
    expect((await request(`${otherPath}/sign-in/email`, {
      email: "alias@example.com", password: "test-password-123",
    })).status).toBe(200);
  });

  it("preserves organization API restrictions", async () => {
    for (const path of ["organization/create", "organization/%63reate"]) {
      const response = await request(`${basePath}/${path}`, { name: "Blocked" });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "use_organization_api" });
    }
  });
});
