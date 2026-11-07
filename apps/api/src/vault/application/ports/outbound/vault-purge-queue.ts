export interface VaultPurgeQueue {
	enqueueVaultPurge(vaultId: string): Promise<void>;
}
