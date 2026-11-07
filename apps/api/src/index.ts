import { logServerError } from "./errors";
import { createRuntimeApp, runScheduledTasks } from "./runtime";
export { SyncCoordinator } from "./sync-coordinator/adapters/inbound/durable-object-rpc/sync-coordinator";

export default {
	async fetch(request, env): Promise<Response> {
		try {
			return await createRuntimeApp(env, request).fetch(request);
		} catch (error) {
			logServerError("fetch", error, request);
			return Response.json(
				{
					error: "internal_error",
					message: "unexpected server error",
				},
				{ status: 500 },
			);
		}
	},
	async scheduled(controller, env): Promise<void> {
		await runScheduledTasks(env, controller.cron);
	},
} satisfies ExportedHandler<Env>;
