import type {
	VaultRecord,
} from "../../dto/vault-types";

export interface VaultKeyStore {
	createVaultForUser(
		userId: string,
		organizationId: string,
		name: string,
        maxVaults?: number,
	): Promise<VaultRecord>;
}
