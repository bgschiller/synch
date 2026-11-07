import type {
	VaultRecord,
} from "../../dto/vault-types";

export interface VaultKeyStore {
	createVaultForUser(
		userId: string,
		organizationId: string,
		name: string,
	): Promise<VaultRecord>;
	moveVaultForUser(
		userId: string,
		vaultId: string,
		targetOrganizationId: string,
	): Promise<VaultRecord>;
}
