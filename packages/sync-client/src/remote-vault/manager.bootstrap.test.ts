import { describe, expect, it, vi } from "vitest";

import type {
  RemoteVaultBootstrapResponse,
  RemoteVaultSummaryResponse,
} from "./types";
import { createManager, remoteVaultSummary } from "./manager-test-helpers";

describe("RemoteVaultManager bootstrap", () => {
  it("lists remote vaults for bootstrap selection", async () => {
    const manager = createManager({
      remoteVaultClient: {
        listRemoteVaults: async (): Promise<RemoteVaultSummaryResponse> => ({
          vaults: [
            remoteVaultSummary(),
          ],
        }),
      },
    });

    const vaults = await manager.listRemoteVaults();

    expect(vaults).toHaveLength(1);
    expect(vaults[0]?.id).toBe("vault-remote");
    expect(vaults[0]?.name).toBe("Remote");
  });

  it("connects the selected remote vault", async () => {
    const manager = createManager({
      remoteVaultClient: {
        listRemoteVaults: async (): Promise<RemoteVaultSummaryResponse> => ({
          vaults: [
            remoteVaultSummary(),
          ],
        }),
        getRemoteVaultBootstrap: async (
          _apiBaseUrl: string,
          _sessionToken: string,
          vaultId: string,
        ): Promise<RemoteVaultBootstrapResponse> => ({
          vault: remoteVaultSummary({ id: vaultId }),
          wrappers: [],
        }),
      },
    });

    const summary = await manager.bootstrapRemoteVault({
      vaultId: "vault-remote",
    });

    expect(summary.vaultId).toBe("vault-remote");
    expect(summary.vaultName).toBe("Remote");
    expect(manager.getRemoteVaultStatus()).toEqual({
      state: "loaded",
      label: "Remote",
    });
  });

  it("does not persist or activate a key when host safety changes during bootstrap", async () => {
    const refreshUi = vi.fn();
    const notify = vi.fn();
    const manager = createManager({
      refreshUi, notify,
      remoteVaultClient: {
        getRemoteVaultBootstrap: async () => ({
          vault: remoteVaultSummary(),
          wrappers: [],
        }),
      },
    });
    const beforeActivate = vi.fn(async () => { throw new Error("Local vault is no longer empty"); });
    await expect(manager.bootstrapRemoteVault({
      vaultId: "vault-remote",
    }, beforeActivate)).rejects.toThrow("Local vault is no longer empty");
    expect(beforeActivate).toHaveBeenCalledOnce();
    expect(manager.getActiveSession()).toBeNull();
    expect(refreshUi).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
