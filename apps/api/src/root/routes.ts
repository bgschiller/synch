import type { Hono } from "hono";

import type { SessionReader } from "../auth/session";

const SIGNED_IN_DESTINATION = "/vaults";
const SIGNED_OUT_DESTINATION = "/signin";

/**
 * Entry point for the browser UI. The root path has no static asset (there is
 * no index.html), so without this route both runtimes fall through to the API
 * notFound handler and return `{"error":"not_found"}`. Redirect to the vault
 * list for authenticated users and to the sign-in page otherwise.
 */
export function registerRootRoute(app: Hono, sessionReader: SessionReader): void {
	app.get("/", async (c) => {
		let destination = SIGNED_OUT_DESTINATION;
		try {
			const session = await sessionReader.readSession({
				url: new URL(c.req.url),
				authorization: c.req.header("authorization"),
				cookie: c.req.header("cookie"),
			});
			if (session) {
				destination = SIGNED_IN_DESTINATION;
			}
		} catch {
			// Fail closed to the sign-in page; it re-checks the session itself
			// and forwards authenticated users on to their vaults.
		}

		c.header("Cache-Control", "no-store");
		return c.redirect(destination, 302);
	});
}
