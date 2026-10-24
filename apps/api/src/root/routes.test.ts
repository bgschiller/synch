import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { AuthenticatedSession, SessionReader } from "../auth/session";
import { registerRootRoute } from "./routes";

function appWith(sessionReader: SessionReader): Hono {
	const app = new Hono();
	registerRootRoute(app, sessionReader);
	return app;
}

function session(): AuthenticatedSession {
	return {
		user: { id: "u1", email: "user@example.com", name: "User" },
		session: { activeOrganizationId: null },
	};
}

describe("root route", () => {
	it("redirects to /signin when there is no session", async () => {
		const app = appWith({ readSession: async () => null });
		const res = await app.request("/");

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/signin");
		expect(res.headers.get("cache-control")).toBe("no-store");
	});

	it("redirects to /vaults when there is a session", async () => {
		const app = appWith({ readSession: async () => session() });
		const res = await app.request("/");

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/vaults");
		expect(res.headers.get("cache-control")).toBe("no-store");
	});

	it("redirects to /signin when session lookup fails", async () => {
		const app = appWith({
			readSession: async () => {
				throw new Error("session store unavailable");
			},
		});
		const res = await app.request("/");

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/signin");
	});
});
