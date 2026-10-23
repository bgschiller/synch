import type {
	VaultKeyEnvelope,
	VaultKeyWrapperRecord,
	VaultRecord,
} from "../../dto/vault-types";

export interface VaultKeyStore {
	createVaultForUser(
		userId: string,
		organizationId: string,
		name: string,
        maxVaults?: number,
	): Promise<VaultRecord>;
	upsertPasswordWrapperForUser(
		userId: string,
		vaultId: string,
		envelope: VaultKeyEnvelope,
	): Promise<VaultKeyWrapperRecord>;
}
