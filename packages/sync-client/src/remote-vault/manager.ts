import { RemoteVaultClient } from "./client";
import { OrganizationApiUnavailableError } from "../sharing/client";
import type {
  RemoteVaultBootstrapResponse,
  RemoteVaultRecord,
  RemoteVaultSession,
  RemoteVaultSessionSummary,
} from "./types";

export interface CreateRemoteVaultInput {
  organizationId?: string;
  name: string;
}

export interface BootstrapRemoteVaultInput {
  vaultId: string;
}

// Vault state for UI display. Label formatting lives in the host app layer.
export type RemoteVaultStatus =
  | { state: "loaded"; label: string }
  | { state: "stored_inactive" }
  | { state: "not_configured" };

// Vault events that require user notification. Message formatting lives in the
// host app layer.
export type RemoteVaultNoticeEvent =
  | { type: "disconnected"; label: string }
  | { type: "created_connected"; label: string }
  | { type: "connected"; label: string };

export type RemoteVaultInputFailure = { kind: "name_required" };

// Carries input validation failures as codes. The user-facing message is
// formatted by the host display layer.
export class RemoteVaultInputError extends Error {
  constructor(readonly failure: RemoteVaultInputFailure) {
    super(`Invalid remote vault input: ${failure.kind}`);
    this.name = "RemoteVaultInputError";
  }
}

export interface RemoteVaultManagerDeps {
  getApiBaseUrl: () => string;
  getAuthSessionToken: () => string;
  hasAuthenticatedSession: () => boolean;
  getStoredRemoteVaultId: () => string | null;
  /** Persists the connected vault id so the session can be restored next launch. */
  saveStoredRemoteVaultId?: (vaultId: string) => Promise<void>;
  refreshUi: () => void;
  notify: (event: RemoteVaultNoticeEvent) => void;
  remoteVaultClient: RemoteVaultClient;
}

export class RemoteVaultManager {
  private readonly remoteVaultClient: RemoteVaultClient;
  private session: RemoteVaultSession | null = null;

  constructor(private readonly deps: RemoteVaultManagerDeps) {
    this.remoteVaultClient = deps.remoteVaultClient;
  }

  getRemoteVaultStatus(): RemoteVaultStatus {
    if (this.session) {
      return { state: "loaded", label: formatVaultLabel(this.session.summary) };
    }

    const storedVaultId = this.deps.getStoredRemoteVaultId();
    if (storedVaultId) {
      return { state: "stored_inactive" };
    }

    return { state: "not_configured" };
  }

  getActiveSession(): RemoteVaultSession | null {
    return this.session;
  }

  getRemoteVaultId(): string | null {
    return this.session?.summary.vaultId ?? null;
  }

  hasConnectedRemoteVault(): boolean {
    return this.session !== null || this.deps.getStoredRemoteVaultId() !== null;
  }

  clearSession(): void {
    this.session = null;
    this.deps.refreshUi();
  }

  async disconnectRemoteVault(options: { notify?: boolean } = {}): Promise<void> {
    const vault = this.session?.summary ?? this.deps.getStoredRemoteVaultId();
    this.session = null;
    this.deps.refreshUi();

    if (vault && options.notify !== false) {
      this.notify({ type: "disconnected", label: formatStoredVaultLabel(vault) });
    }
  }

  async restoreStoredSessionIfNeeded(): Promise<void> {
    if (this.session || !this.deps.hasAuthenticatedSession()) {
      return;
    }

    const remoteVaultId = this.deps.getStoredRemoteVaultId();
    if (!remoteVaultId) {
      return;
    }

    const bootstrap = await this.remoteVaultClient.getRemoteVaultBootstrap(
      this.deps.getApiBaseUrl(),
      this.deps.getAuthSessionToken(),
      remoteVaultId,
    );

    this.session = {
      summary: {
        vaultId: bootstrap.vault.id,
        organizationId: bootstrap.vault.organizationId,
        vaultName: bootstrap.vault.name,
        activeKeyVersion: bootstrap.vault.activeKeyVersion,
        bootstrappedAt: new Date().toISOString(),
      },
    };
    this.deps.refreshUi();
  }

  async listRemoteVaults(): Promise<RemoteVaultRecord[]> {
    this.ensureAuthenticated();

    const listed = await this.remoteVaultClient.listRemoteVaults(
      this.deps.getApiBaseUrl(),
      this.deps.getAuthSessionToken(),
    );

    return listed.vaults;
  }

  async listCreatableOrganizations(): Promise<{ id: string; name: string }[]> {
    this.ensureAuthenticated();
    try {
      return (await this.remoteVaultClient.listOrganizations(
        this.deps.getApiBaseUrl(), this.deps.getAuthSessionToken(),
      )).filter(org => org.role === "owner" || org.role === "admin");
    } catch (error) {
      // Older servers choose the user's default organization when none is sent.
      if (error instanceof OrganizationApiUnavailableError) return [];
      throw error;
    }
  }

  async createRemoteVault(input: CreateRemoteVaultInput): Promise<RemoteVaultSessionSummary> {
    this.ensureAuthenticated();
    validateCreateInput(input);

    const { vault } = await this.remoteVaultClient.createRemoteVault(
      this.deps.getApiBaseUrl(),
      this.deps.getAuthSessionToken(),
      {
        name: input.name.trim(),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
    );

    const bootstrap = await this.remoteVaultClient.getRemoteVaultBootstrap(
      this.deps.getApiBaseUrl(),
      this.deps.getAuthSessionToken(),
      vault.id,
    );
    await this.loadBootstrapRemoteVaultSession(bootstrap);

    const summary = this.requireSession().summary;
    this.notify({ type: "created_connected", label: summary.vaultName });
    return summary;
  }

  async bootstrapRemoteVault(
    input: BootstrapRemoteVaultInput,
    beforeActivate?: () => Promise<void>,
  ): Promise<RemoteVaultSessionSummary> {
    this.ensureAuthenticated();

    const vaultId = input.vaultId.trim();
    if (!vaultId) {
      throw new Error("Vault selection is required.");
    }

    const bootstrap = await this.remoteVaultClient.getRemoteVaultBootstrap(
      this.deps.getApiBaseUrl(),
      this.deps.getAuthSessionToken(),
      vaultId,
    );
    await this.loadBootstrapRemoteVaultSession(bootstrap, beforeActivate);

    const summary = this.requireSession().summary;
    this.notify({ type: "connected", label: summary.vaultName });
    return summary;
  }

  private async loadBootstrapRemoteVaultSession(
    bootstrap: RemoteVaultBootstrapResponse,
    beforeActivate?: () => Promise<void>,
  ): Promise<void> {
    // Let the host revalidate local-vault safety and account identity before
    // activating the session.
    await beforeActivate?.();
    const summary: RemoteVaultSessionSummary = {
      vaultId: bootstrap.vault.id,
      organizationId: bootstrap.vault.organizationId,
      vaultName: bootstrap.vault.name,
      activeKeyVersion: bootstrap.vault.activeKeyVersion,
      bootstrappedAt: new Date().toISOString(),
    };

    this.session = {
      summary,
    };
    await this.deps.saveStoredRemoteVaultId?.(summary.vaultId);
    this.deps.refreshUi();
  }

  private ensureAuthenticated(): void {
    if (!this.deps.hasAuthenticatedSession()) {
      throw new Error("Sign in before managing a vault.");
    }
  }

  private notify(event: RemoteVaultNoticeEvent): void {
    this.deps.notify(event);
  }

  private requireSession(): RemoteVaultSession {
    if (!this.session) {
      throw new Error("Vault session is not loaded.");
    }

    return this.session;
  }
}

function validateCreateInput(input: CreateRemoteVaultInput): void {
  if (!input.name.trim()) {
    throw new RemoteVaultInputError({ kind: "name_required" });
  }
}

function formatVaultLabel(vault: Pick<RemoteVaultSessionSummary, "vaultId" | "vaultName">): string {
  return vault.vaultName;
}

function formatStoredVaultLabel(
  vault: string | RemoteVaultSessionSummary,
): string {
  if (typeof vault === "string") {
    return vault;
  }

  if (vault.vaultName) {
    return vault.vaultName;
  }

  return vault.vaultId;
}
