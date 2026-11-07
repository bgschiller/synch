export interface RemoteVaultRecord {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
}

export interface RemoteVaultBootstrapResponse {
  vault: RemoteVaultRecord;
}

export interface RemoteVaultSummaryResponse {
  vaults: RemoteVaultRecord[];
}

export interface CreateRemoteVaultResponse {
  vault: RemoteVaultRecord;
}

export interface RemoteVaultSessionSummary {
  organizationId?: string;
  vaultId: string;
  vaultName: string;
  bootstrappedAt: string | null;
}

export interface RemoteVaultSession {
  summary: RemoteVaultSessionSummary;
}
