import { resolveUrlBinding } from "./env";

export type CloudflareRuntimeEnv = Omit<
	Env,
	"AUTH_ALLOWED_EMAILS" | "AUTH_EMAIL_FROM" | "EMAIL"
> & {
	AUTH_ALLOWED_EMAILS?: string;
	EMAIL?: SendEmail;
	AUTH_EMAIL_FROM?: string;
	BETTER_AUTH_URL?: string;
	ADMIN_TOKEN?: string;
};

export type CloudflareHttpConfig = {
	authBaseUrl: string;
	publicOrigin: string;
	corsOrigin: string;
};

export function parseCloudflareHttpConfig(
	env: CloudflareRuntimeEnv,
	request: Request,
): CloudflareHttpConfig {
	const requestOrigin = new URL(request.url).origin;
	const authBaseUrl = resolveUrlBinding("BETTER_AUTH_URL", env.BETTER_AUTH_URL, requestOrigin);
	const publicOrigin = new URL(authBaseUrl).origin;
	const corsOrigin = publicOrigin;

	return {
		authBaseUrl,
		publicOrigin,
		corsOrigin,
	};
}
