// Cap the number of vault-scoped organizations a user may create (work, personal,
// household, etc.). Better Auth's organization plugin requires a concrete limit;
// use a generously high value instead of a sentinel.
export const MAX_ORGANIZATIONS_PER_USER = 100;

export function defaultOrganizationSlug(userId: string): string {
	return `user-${userId.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
}
