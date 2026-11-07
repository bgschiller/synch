import { DrizzleSharingStore } from "../sharing/adapters/drizzle-sharing-store";
import { CoordinatorProxyRepository } from "../sync-coordinator/adapters/outbound/durable-object-rpc/coordinator-proxy-repository";
import type { CloudflareRuntimeEnv } from "../config/cloudflare";
import { createDb } from "../db/client";
import { flushSharingRefreshes } from "../sharing/application/refresh";

export const SHARING_REFRESH_CRON = "*/5 * * * *";

export async function runScheduledTasks(
	env: CloudflareRuntimeEnv,
	cron: string,
): Promise<void> {
	if (cron === SHARING_REFRESH_CRON) await runSharingRefreshSchedule(env);
}

export async function runSharingRefreshSchedule(
	env: CloudflareRuntimeEnv,
): Promise<void> {
	const sharingStore = new DrizzleSharingStore(createDb(env.DB));
	await flushSharingRefreshes(
		sharingStore,
		new CoordinatorProxyRepository(env.SYNC_COORDINATOR),
	);
}
