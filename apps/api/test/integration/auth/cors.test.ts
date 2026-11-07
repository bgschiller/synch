import { describe, expect, it } from "vitest";

import { apiRequest } from "../../helpers/api";

function apiOrigin(): string {
	return new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:8787").origin;
}

describe("auth CORS integration", () => {
	it("allows CORS requests from the API's own origin", async () => {
		const allowedOrigin = apiOrigin();

		const response = await apiRequest("/health", {
			headers: {
				origin: allowedOrigin,
			},
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
		expect(response.headers.get("access-control-allow-credentials")).toBe("true");
	});

	it("handles CORS preflight only for the API's own origin", async () => {
		const allowedOrigin = apiOrigin();

		const allowedResponse = await apiRequest("/api/auth/get-session", {
			method: "OPTIONS",
			headers: {
				origin: allowedOrigin,
				"access-control-request-method": "GET",
			},
		});

		expect(allowedResponse.status).toBe(204);
		expect(allowedResponse.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
		expect(allowedResponse.headers.get("access-control-allow-credentials")).toBe("true");

		const deniedResponse = await apiRequest("/api/auth/get-session", {
			method: "OPTIONS",
			headers: {
				origin: "https://evil.example",
				"access-control-request-method": "GET",
			},
		});

		expect(deniedResponse.status).toBe(204);
		expect(deniedResponse.headers.get("access-control-allow-origin")).toBeNull();
	});
});
