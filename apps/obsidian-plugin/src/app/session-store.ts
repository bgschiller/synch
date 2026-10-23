import type { Plugin } from "obsidian";

import { migrateLegacyAuthSessionToken } from "../adapters/auth-session-storage";
import type { SyncConnection } from "@synch/sync-client/store";

export interface SynchPluginSessionStoreDeps {
  plugin: Plugin;
  refreshUi: () => void;
}

export class SynchPluginSessionStore {
  private storedSyncConnection: SyncConnection | null = null;

  constructor(private readonly deps: SynchPluginSessionStoreDeps) {}

  async migrateLegacySecrets(): Promise<void> {
    await migrateLegacyAuthSessionToken(this.deps.plugin);
  }

  setStoredSyncConnection(connection: SyncConnection | null): void {
    this.storedSyncConnection = connection;
  }

  getStoredRemoteVaultId(): string | null {
    return this.storedSyncConnection?.remoteVaultId ?? null;
  }
}
