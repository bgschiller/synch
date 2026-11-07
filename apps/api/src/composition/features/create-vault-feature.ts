import { DrizzleSharingStore } from "../../sharing/adapters/drizzle-sharing-store";
import type { AppDb } from "../../db/client";
import type { VaultPurgeMessage } from "../../vault/application";
import type { VaultOrganizationReader } from "../../vault/application/ports/inbound/vault-organization-reader";
import type { VaultService } from "../../vault/application/ports/inbound/vault-service";
import type { VaultPurgeQueue } from "../../vault/application/ports/outbound/vault-purge-queue";
import { VaultPurgeConsumer } from "../../vault/adapters/inbound/queue/purge-consumer";
import { CloudflareVaultPurgeQueue } from "../../vault/adapters/outbound/purge-queue";
import { InlineVaultPurgeQueue } from "../../vault/adapters/outbound/inline-purge-queue";
import {
	CoordinatorPurgeWriter,
	type CoordinatorPurgeTransport,
} from "../../vault/adapters/outbound/coordinator-purge-writer";
import { DrizzleVaultStore } from "../../vault/adapters/outbound/drizzle-vault-store";
import { VaultApplicationService } from "../../vault/application/services/vault-service";
import { VaultPurgeService } from "../../vault/application/services/vault-lifecycle-service";
import { VaultOrganizationService } from "../../vault/application/services/vault-organization-service";

export type VaultFeature = {
	service: VaultService;
	organizationReader: VaultOrganizationReader;
	purgeConsumer: VaultPurgeConsumer;
};

export type VaultFeatureConfig = {
	db: AppDb;
	coordinatorPurgeTransport: CoordinatorPurgeTransport;
	vaultPurgeQueue?: Queue<VaultPurgeMessage>;
};

export function createVaultFeature(config: VaultFeatureConfig): VaultFeature {
	const store = new DrizzleVaultStore(config.db);
	const purgeConsumer = new VaultPurgeConsumer(
		new VaultPurgeService(
			store,
			new CoordinatorPurgeWriter(config.coordinatorPurgeTransport),
		),
	);
	const purgeQueue: VaultPurgeQueue = config.vaultPurgeQueue
		? new CloudflareVaultPurgeQueue(config.vaultPurgeQueue)
		: new InlineVaultPurgeQueue(purgeConsumer);

	return {
		service: new VaultApplicationService(
			store,
			store,
			store,
			store,
			purgeQueue,
			async (userId, organizationId) => { const member = await new DrizzleSharingStore(config.db).membership(organizationId, userId); return member?.role === "owner" || member?.role === "admin"; },
		),
		organizationReader: new VaultOrganizationService(store),
		purgeConsumer,
	};
}

/** Composition-only reader for coordinator/subscription integration points. */
export function createVaultOrganizationReader(
	db: AppDb,
): VaultOrganizationReader {
	return new VaultOrganizationService(new DrizzleVaultStore(db));
}
