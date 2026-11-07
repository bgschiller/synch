import { createApiApplication } from "../composition/create-api-application";
import {
	parseCloudflareHttpConfig,
	type CloudflareRuntimeEnv,
} from "../config/cloudflare";
import { createDb } from "../db/client";
import { R2BlobObjectStorage } from "../sync-blob-transfer/adapters/outbound/r2-object-storage";

export function createRuntimeApp(env: CloudflareRuntimeEnv, request: Request) {
	const config = parseCloudflareHttpConfig(env, request);
	const application = createApiApplication(
		{
			db: createDb(env.DB),
			blobStorage: new R2BlobObjectStorage(env.SYNC_BLOBS),
			coordinatorNamespace: env.SYNC_COORDINATOR,
		},
		{
			corsOrigin: config.corsOrigin,
			auth: {
				baseURL: config.authBaseUrl,
				trustedOrigins: Array.from(
					new Set([config.publicOrigin, config.corsOrigin]),
				),
				email: env.EMAIL,
				emailFrom: env.AUTH_EMAIL_FROM,
				allowedEmails: requireNonBlankStringBinding(
					env.AUTH_ALLOWED_EMAILS,
					"AUTH_ALLOWED_EMAILS",
				),
			},
			syncTokenSecret: env.SYNC_TOKEN_SECRET,
			syncTokenTtlSeconds: env.SYNC_TOKEN_TTL_SECONDS,
			adminToken: env.ADMIN_TOKEN,
		},
	);

	return {
		async fetch(request: Request): Promise<Response> {
			return await application.app.fetch(request);
		},
	};
}

function requireNonBlankStringBinding(
	binding: string | undefined,
	name: string,
): string {
	if (!binding?.trim()) {
		throw new Error(`${name} binding is required`);
	}

	return binding;
}
