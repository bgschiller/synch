export type VaultRecord = {
	id: string;
	organizationId: string;
	name: string;
	createdAt: Date;
	deletedAt: Date | null;
	purgeStatus: "queued" | "running" | "failed" | null;
	purgeError: string | null;
};

export type VaultBootstrapRecord = {
	vault: VaultRecord;
};
