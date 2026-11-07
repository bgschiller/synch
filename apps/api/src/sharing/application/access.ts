import type { SharingStore } from "./store";
import { SharingError } from "./types";

/** Authoritative D1 checks used when issuing a sync token. */
export class SharingAccess {
	constructor(private readonly store: SharingStore) {}
	async require(
		userId: string,
		vaultId: string,
	): Promise<number> {
		const vault = await this.store.vault(vaultId);
		const grant = await this.store.grant(vaultId, userId);
		if (
			!vault ||
			!grant ||
			grant.status !== "active" ||
			!(await this.store.membership(vault.organizationId, userId))
		)
			throw new SharingError(
				403,
				"vault_access_denied",
				"Vault access has been removed or is awaiting key setup",
			);
		return grant.accessVersion;
	}
}
