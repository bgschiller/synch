export type { VaultBootstrapRecord, VaultRecord } from "../../domain/types";

export type VaultPurgeResult = {
	vaultId: string;
	deletionStatus: "queued";
};
