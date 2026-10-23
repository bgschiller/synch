export type VaultRecord = {
	id: string;
	organizationId: string;
	name: string;
	activeKeyVersion: number;
	createdAt: Date;
	deletedAt: Date | null;
	purgeStatus: "queued" | "running" | "failed" | null;
	purgeError: string | null;
};

export type VaultBootstrapRecord = {
	vault: VaultRecord;
};

/** A vault whose content has not changed since the inactivity cutoff. */
export type InactiveVaultCandidate = {
	vaultId: string;
	organizationId: string;
	vaultName: string;
	ownerEmail: string;
	lastCommitAt: number | null;
};

/** Captured before hard deletion so retention notices survive the purge. */
export type VaultInactivityNotice = {
	vaultName: string;
	ownerEmail: string;
	lastCommitAt: number | null;
};
