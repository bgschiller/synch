export type OrganizationRole = "owner" | "admin" | "member";
export class SharingError extends Error {
	constructor(
		readonly status: 400 | 403 | 404 | 409 | 429 | 503,
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}
export type SharingActor = { id: string; email: string };
