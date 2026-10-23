export type {
	InactiveVaultCandidate,
	VaultInactivityNotice,
	VaultBootstrapRecord,
	VaultRecord,
} from "../../domain/types";

export type VaultPurgeResult = {
	vaultId: string;
	deletionStatus: "queued";
};
