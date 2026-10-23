import { describe, expect, it } from "vitest";

import type { StoredRemoteVaultKeySecret } from "./types";
import type {
  CreateRemoteVaultResponse,
  RemoteVaultBootstrapResponse,
} from "./types";
import { createManager } from "./manager-test-helpers";

describe("RemoteVaultManager create", () => {
  it("creates a vault and stores a loaded session", async () => {
    const savedVaults: Array<StoredRemoteVaultKeySecret | null> = [];
    const createCalls: Array<unknown> = [];

    const manager = createManager({
      savedVaults,
      remoteVaultClient: {
        createRemoteVault: async (
          _apiBaseUrl: string,
          _sessionToken: string,
          input: unknown,
        ): Promise<CreateRemoteVaultResponse> => {
          createCalls.push(input);
          return {
            vault: {
              id: "vault-created",
              organizationId: "org-1",
              name: "Personal",
              activeKeyVersion: 1,
              createdAt: "2026-04-22T00:00:00.000Z",
            },
          };
        },
        getRemoteVaultBootstrap: async (): Promise<RemoteVaultBootstrapResponse> => ({
          vault: {
            id: "vault-created",
            organizationId: "org-1",
            name: "Personal",
            activeKeyVersion: 1,
            createdAt: "2026-04-22T00:00:00.000Z",
          },
          wrappers: [],
        }),
      },
    });

    const summary = await manager.createRemoteVault({
      name: "Personal",
    });

    expect(summary.vaultId).toBe("vault-created");
    expect(summary.vaultName).toBe("Personal");
    expect(savedVaults).toEqual([]);
    expect(manager.getActiveSession()?.summary.vaultId).toBe("vault-created");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      name: "Personal",
    });
  });

  it("rejects an empty name when creating a vault", async () => {
    const manager = createManager({});

    await expect(
      manager.createRemoteVault({ name: "   " }),
    ).rejects.toMatchObject({
      name: "RemoteVaultInputError",
      failure: { kind: "name_required" },
    });
  });
});
