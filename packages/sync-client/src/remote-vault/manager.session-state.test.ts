import { describe, expect, it, vi } from "vitest";

import type { RemoteVaultBootstrapResponse } from "./types";
import { createManager } from "./manager-test-helpers";

describe("RemoteVaultManager session state", () => {
  it("disconnects the current vault from this device", async () => {
    const notify = vi.fn();
    const refreshUi = vi.fn();

    const manager = createManager({
      storedVaultId: "vault-connected",
      refreshUi,
      notify,
    });

    expect(manager.hasConnectedRemoteVault()).toBe(true);
    expect(manager.getRemoteVaultStatus()).toEqual({ state: "stored_inactive" });

    await manager.disconnectRemoteVault();

    expect(manager.getActiveSession()).toBeNull();
    expect(notify).toHaveBeenCalledWith({
      type: "disconnected",
      label: "vault-connected",
    });
    expect(refreshUi).toHaveBeenCalled();
  });

  it("restores a persisted vault session after sign-in", async () => {
    const refreshUi = vi.fn();

    const manager = createManager({
      storedVaultId: "vault-restored",
      refreshUi,
      remoteVaultClient: {
        getRemoteVaultBootstrap: async (): Promise<RemoteVaultBootstrapResponse> => ({
          vault: {
            id: "vault-restored",
            organizationId: "org-1",
            name: "Restored",
            activeKeyVersion: 1,
            createdAt: "2026-04-22T00:00:00.000Z",
          },
        }),
      },
    });

    await manager.restoreStoredSessionIfNeeded();

    expect(manager.getActiveSession()?.summary.vaultId).toBe("vault-restored");
    expect(manager.getActiveSession()?.summary.vaultName).toBe("Restored");
    expect(refreshUi).toHaveBeenCalled();
  });
});
