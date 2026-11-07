export const SIGN_UP_EMAIL_NOT_ALLOWED = {
	code: "SIGN_UP_EMAIL_NOT_ALLOWED",
	message: "This email address is not allowed to sign up.",
} as const;

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function parseAllowedEmails(
	value: string | undefined,
): ReadonlySet<string> | undefined {
	if (!value?.trim()) {
		return undefined;
	}

	return new Set(value.split(",").map(normalizeEmail).filter(Boolean));
}

export function isEmailAllowed(
	email: string,
	allowedEmails: ReadonlySet<string>,
): boolean {
	const normalized = normalizeEmail(email);
	if (allowedEmails.has(normalized)) {
		return true;
	}
	// A bare "@domain" entry allows every address at that domain.
	const atIndex = normalized.indexOf("@");
	return atIndex >= 0 && allowedEmails.has(normalized.slice(atIndex));
}
