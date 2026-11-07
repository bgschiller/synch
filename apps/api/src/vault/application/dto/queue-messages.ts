export type VaultPurgeMessage = {
	type: "vault_purge";
	vaultId: string;
	reason?: "manual";
};
