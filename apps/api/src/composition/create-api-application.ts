import { DrizzleSharingStore } from "../sharing/adapters/drizzle-sharing-store";
import { SharingService } from "../sharing/application/service";
import { SharingAccess } from "../sharing/application/access";
import { createApp } from "../app";
import type { AuthFeatureConfig } from "../auth/better-auth";
import { createAuthFeature } from "./features/create-auth-feature";
import { createVaultFeature } from "./features/create-vault-feature";
import { createSyncAccessFeature } from "./features/create-sync-access-feature";
import { createSyncBlobTransferFeature } from "./features/create-sync-blob-transfer-feature";
import type { AppDb } from "../db/client";
import {
	CoordinatorProxyRepository,
	type CoordinatorNamespace,
} from "../sync-coordinator/adapters/outbound/durable-object-rpc/coordinator-proxy-repository";
import type { BlobObjectStorage } from "../sync-blob-transfer/application/ports/outbound/blob-object-storage";
import {
	blobObjectKey,
	blobObjectKeyPrefix,
} from "../platform/blob/object-key";
import type { VaultPurgeMessage } from "../vault/application";

export type ApiApplicationDependencies = {
	db: AppDb;
	blobStorage: BlobObjectStorage;
	coordinatorNamespace: CoordinatorNamespace;
	vaultPurgeQueue?: Queue<VaultPurgeMessage>;
};

export type ApiApplicationConfig = {
	corsOrigin: string;
	auth: AuthFeatureConfig;
	syncTokenSecret: string;
	syncTokenTtlSeconds?: number;
	adminToken?: string;
};

/**
 * Builds the platform-neutral API service graph. Runtime entrypoints only
 * provide storage, coordinator and background-job adapters plus validated
 * configuration; repository and service wiring stays identical everywhere.
 */
export function createApiApplication(
	deps: ApiApplicationDependencies,
	config: ApiApplicationConfig,
) {
	const coordinatorProxyRepository = new CoordinatorProxyRepository(
		deps.coordinatorNamespace,
	);
	const vaultFeature = createVaultFeature({
		db: deps.db,
		coordinatorPurgeTransport: coordinatorProxyRepository,
		vaultPurgeQueue: deps.vaultPurgeQueue,
	});
	const authFeature = createAuthFeature(deps.db, config.auth);
	const sharingStore = new DrizzleSharingStore(deps.db);
	const sharingAccess = new SharingAccess(sharingStore);
	const sharing = new SharingService(
		sharingStore,
		coordinatorProxyRepository,
		{
			...config.auth,
			requireVerifiedEmail: false,
		},
	);
	const syncAccessFeature = createSyncAccessFeature({
		vaultService: vaultFeature.service,
		accessReader: (userId, vaultId) => sharingAccess.require(userId, vaultId),
		accessVerifier: async (claims, token) =>
			coordinatorProxyRepository.authorizeSync(claims.vaultId, token, claims),
		coordinatorNamespace: deps.coordinatorNamespace,
		syncTokenSecret: config.syncTokenSecret,
		syncTokenTtlSeconds: config.syncTokenTtlSeconds,
	});
	const syncBlobTransferFeature = createSyncBlobTransferFeature({
		objectStorage: deps.blobStorage,
		coordinatorNamespace: deps.coordinatorNamespace,
		tokenVerifier: syncAccessFeature.tokenVerifier,
		objectKeyBuilder: { blobObjectKey, blobObjectKeyPrefix },
	});
	return {
		flushSharingRefreshes: () => sharing.flushRefreshes(),
		app: createApp(
			{
				sharing,
				authHttpHandler: authFeature.authHttpHandler,
				sessionReader: authFeature.sessionReader,
				syncTokenIssuer: syncAccessFeature.tokenIssuer,
				syncTokenRequestVerifier: syncAccessFeature.requestTokenVerifier,
				uploadBlob: syncBlobTransferFeature.uploadBlob,
				downloadBlob: syncBlobTransferFeature.downloadBlob,
				vaultService: vaultFeature.service,
				coordinatorProxyRepository,
			},
			{
				corsOrigin: config.corsOrigin,
				authBaseUrl: config.auth.baseURL,
				adminToken: config.adminToken,
			},
		),
		syncTokenVerifier: syncAccessFeature.tokenVerifier,
	};
}
