import { asc, eq } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { bearer, deviceAuthorization, organization } from "better-auth/plugins";

import type { AppDb } from "../db/client";
import * as schema from "../db/d1";
import {
	isEmailAllowed,
	parseAllowedEmails,
	SIGN_UP_EMAIL_NOT_ALLOWED,
} from "./policies/allowed-emails";
import { defaultOrganizationSlug, MAX_ORGANIZATIONS_PER_USER } from "./policies/organization";

export type OutgoingEmail = {
	from: string;
	to: string;
	subject: string;
	text?: string;
	html?: string;
};

export type EmailSender = {
	send(message: OutgoingEmail): Promise<unknown>;
};

export type AuthFeatureConfig = {
	baseURL: string;
	trustedOrigins: string[];
	secret?: string;
	email?: EmailSender;
	emailFrom?: string;
	allowedEmails?: string;
};

export type AuthPlugin = BetterAuthPlugin;
export type BetterAuthConfig = AuthFeatureConfig & {
	plugins?: AuthPlugin[];
};

/** Auth lifetime for signed-in clients (bearer token and cookies). */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;

export function createBetterAuth(db: AppDb, config: BetterAuthConfig) {
	const allowedEmails = parseAllowedEmails(config.allowedEmails);
	const auth = betterAuth({
		baseURL: config.baseURL,
		secret: config.secret,
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema,
		}),
		trustedOrigins: config.trustedOrigins,
		emailAndPassword: {
			enabled: true,
		},
		session: {
			expiresIn: SESSION_EXPIRES_IN_SECONDS,
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/sign-up/email") return;
				const body: unknown = ctx.body;
				if (!body || typeof body !== "object" || !("email" in body) || typeof body.email !== "string") return;
				const existing = await ctx.context.internalAdapter.findUserByEmail(body.email.toLowerCase());
				if (existing) {
					// Return an explicit error when the email is already registered.
					throw APIError.from("UNPROCESSABLE_ENTITY", {
						code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
						message: "This email is already registered. Please sign in instead.",
					});
				}
			}),
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						if (allowedEmails && !isEmailAllowed(user.email, allowedEmails)) {
							throw APIError.from("FORBIDDEN", SIGN_UP_EMAIL_NOT_ALLOWED);
						}
					},
					after: async (user) => {
						if (await readDefaultOrganizationIdForUser(db, user.id)) {
							return;
						}

						await auth.api.createOrganization({
							body: {
								name: "Personal Organization",
								slug: defaultOrganizationSlug(user.id),
								userId: user.id,
								keepCurrentActiveOrganization: true,
							},
						});
					},
				},
			},
			session: {
				create: {
					before: async (session) => {
						const organizationId = await readDefaultOrganizationIdForUser(
							db,
							session.userId,
						);
						if (!organizationId) {
							return;
						}

						return {
							data: {
								...session,
								activeOrganizationId: organizationId,
							},
						};
					},
					after: async (session) => {
						if (
							typeof session.activeOrganizationId === "string" &&
							session.activeOrganizationId
						) {
							return;
						}

						const organizationId = await readDefaultOrganizationIdForUser(
							db,
							session.userId,
						);
						if (!organizationId) {
							return;
						}

						await setSessionActiveOrganization(db, session.id, organizationId);
					},
				},
			},
		},
		plugins: [
			organization({ organizationLimit: MAX_ORGANIZATIONS_PER_USER }),
			...(config.plugins ?? []),
			bearer(),
			deviceAuthorization({
				verificationUri: getDeviceVerificationUri(config.baseURL),
				schema: {},
			}),
		],
	});

	return auth;
}

export type BetterAuth = ReturnType<typeof createBetterAuth>;

async function readDefaultOrganizationIdForUser(
	db: AppDb,
	userId: string,
): Promise<string | null> {
	const rows = await db
		.select({
			organizationId: schema.member.organizationId,
		})
		.from(schema.member)
		.where(eq(schema.member.userId, userId))
		.orderBy(asc(schema.member.createdAt))
		.limit(1);

	return rows[0]?.organizationId ?? null;
}

async function setSessionActiveOrganization(
	db: AppDb,
	sessionId: string,
	organizationId: string,
): Promise<void> {
	await db
		.update(schema.session)
		.set({ activeOrganizationId: organizationId })
		.where(eq(schema.session.id, sessionId));
}

function getDeviceVerificationUri(baseURL: string): string {
	return new URL("/device", baseURL).toString();
}
