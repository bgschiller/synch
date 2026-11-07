export interface VaultLifecycleStore {
	markVaultDeletionQueued(vaultId: string): Promise<boolean>;
	markVaultDeletionQueueFailed(vaultId: string, message: string): Promise<void>;
	markVaultPurgeRunning(vaultId: string): Promise<void>;
	markVaultPurgeFailed(vaultId: string, message: string): Promise<void>;
	hardDeleteVault(vaultId: string): Promise<void>;
}
