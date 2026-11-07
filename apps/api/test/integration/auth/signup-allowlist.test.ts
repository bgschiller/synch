import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { extractCookieHeader, uniqueId } from "../../helpers/api";
import { requestWithEnv, type RuntimeTestEnv } from "./helpers";

describe("auth sign-up allowlist integration", () => {
	it("keeps sign-up independent from email configuration", async () => {
		const accountEmail = `${uniqueId("signup-auth")}@example.com`;
		const testEnv: RuntimeTestEnv = {
			...env,
			EMAIL: undefined,
			AUTH_ALLOWED_EMAILS: accountEmail,
		};

		const signUp = await jsonRequestWithEnv<{ token: string | null }>(
			"/api/auth/sign-up/email",
			testEnv,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					name: "Self Hosted User",
					email: accountEmail,
					password: "supersecret123",
				}),
			},
		);

		expect(signUp.response.status).toBe(200);
		expect(signUp.json?.token).toBeTruthy();
		expect(extractCookieHeader(signUp.response)).toContain("better-auth.session_token=");
	});

	it.each([undefined, "   "])(
		"fails closed when the email allowlist is %s",
		async (authAllowedEmails) => {
			const testEnv: RuntimeTestEnv = {
				...env,
				AUTH_ALLOWED_EMAILS: authAllowedEmails,
			};

			await expect(requestWithEnv("/health", testEnv)).rejects.toThrow();
		},
	);

	it("restricts sign-up to the configured email allowlist", async () => {
		const allowedEmail = `${uniqueId("allowed-signup-auth")}@example.com`;
		const testEnv: RuntimeTestEnv = {
			...env,
			EMAIL: undefined,
			AUTH_ALLOWED_EMAILS: ` OTHER@example.com, ${allowedEmail.toUpperCase()} `,
		};
		const signUp = (email: string) =>
			jsonRequestWithEnv<{ token?: string; code?: string; message?: string }>(
				"/api/auth/sign-up/email",
				testEnv,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						name: "Self Hosted User",
						email,
						password: "supersecret123",
					}),
				},
			);

		const denied = await signUp(`${uniqueId("denied-signup-auth")}@example.com`);
		expect(denied.response.status).toBe(403);
		expect(denied.json).toMatchObject({
			code: "SIGN_UP_EMAIL_NOT_ALLOWED",
		});
		expect(extractCookieHeader(denied.response)).not.toContain("better-auth.session_token=");

		const allowed = await signUp(allowedEmail);
		expect(allowed.response.status).toBe(200);
		expect(allowed.json?.token).toBeTruthy();
		expect(extractCookieHeader(allowed.response)).toContain("better-auth.session_token=");
	});
});

async function jsonRequestWithEnv<T = unknown>(
	path: string,
	testEnv: RuntimeTestEnv,
	init: RequestInit = {},
): Promise<{ response: Response; json: T | null; text: string }> {
	const response = await requestWithEnv(path, testEnv, init);
	const text = await response.text();

	return {
		response,
		text,
		json: text ? (JSON.parse(text) as T) : null,
	};
}
