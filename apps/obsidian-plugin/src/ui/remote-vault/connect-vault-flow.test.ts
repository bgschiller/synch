import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharingManager, SharingOrganization } from "@synch/sync-client/remote";
import { OrganizationApiUnavailableError } from "@synch/sync-client/remote";
import { ApiRequestError } from "@synch/sync-client/http";
import { resetObsidianMocks } from "../../test-stubs/obsidian";
import { t } from "../../i18n";
import { ConnectVaultFlow } from "./connect-vault-flow";

function setup() {
  const organization: SharingOrganization = {
    id: "org", name: "Team", role: "member",
    sharing: { enabled: true, memberLimit: 3 },
    vaults: [{ id: "vault", name: "Notes", personal: false, canManage: false, status: "active", shared: true, members: [] }],
  };
  const manager = {
    client: { organizations: vi.fn(async () => [organization]) },
  };
  const deps = {
    listLegacyVaults: vi.fn(async () => [{
      id: "legacy", name: "Personal notes", organizationId: "org",
      activeKeyVersion: 1, createdAt: "2026-01-01T00:00:00.000Z",
    }]),
    manager: manager as unknown as SharingManager,
    isCurrentAccount: vi.fn(() => true),
    hasExistingFiles: vi.fn(async () => false),
    confirmPersonalVault: vi.fn(async () => true),
    bootstrap: vi.fn(async (_input: unknown, beforeActivate: () => Promise<void>) => { await beforeActivate(); }),
  };
  return { flow: new ConnectVaultFlow(deps), deps, manager, organization, vault: organization.vaults[0]! };
}

beforeEach(resetObsidianMocks);

describe("vault connection safety", () => {
  it.each([true, false])("preserves merge confirmation on older servers (%s)", async (confirmed) => {
    const { flow, manager, deps } = setup();
    manager.client.organizations.mockRejectedValue(new OrganizationApiUnavailableError());
    deps.hasExistingFiles.mockResolvedValue(true);
    deps.confirmPersonalVault.mockResolvedValue(confirmed);
    expect(await flow.list()).toEqual([expect.objectContaining({
      sharingEnabled: false,
      vault: expect.objectContaining({ id: "legacy", personal: true, status: "active" }),
    })]);
    await expect(flow.connect("legacy")).resolves.toBe(confirmed);
    expect(deps.confirmPersonalVault).toHaveBeenCalledOnce();
    expect(deps.bootstrap).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  });

  it.each([401, 403, 404, 503])("does not fall back for an ordinary API error (%s)", async (status) => {
    const { flow, manager, deps } = setup();
    // A detail endpoint's 404 is not an OrganizationApiUnavailableError.
    manager.client.organizations.mockRejectedValue(new ApiRequestError(status, "failed", "Unavailable"));
    await expect(flow.list()).rejects.toThrow("Unavailable");
    expect(deps.listLegacyVaults).not.toHaveBeenCalled();
  });

  it("rechecks the account after loading the legacy vault list", async () => {
    const { flow, manager, deps } = setup();
    manager.client.organizations.mockRejectedValue(new OrganizationApiUnavailableError());
    deps.listLegacyVaults.mockImplementation(async () => {
      deps.isCurrentAccount.mockReturnValue(false);
      return [];
    });
    await expect(flow.list()).rejects.toThrow(t("sharing.accountChanged"));
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });

  it.each(["member", "admin"] as const)("blocks an invited %s from connecting existing files", async (role) => {
    const { flow, deps, vault } = setup();
    vault.canManage = role === "admin";
    deps.hasExistingFiles.mockResolvedValue(true);
    await expect(flow.connect("vault")).rejects.toThrow(t("vault.invitedNeedsEmpty"));
    expect(deps.bootstrap).not.toHaveBeenCalled();
    expect(deps.confirmPersonalVault).not.toHaveBeenCalled();
  });

  it("allows an invited member to connect an empty vault", async () => {
    const { flow, deps } = setup();
    await expect(flow.connect("vault")).resolves.toBe(true);
    expect(deps.bootstrap).toHaveBeenCalledWith({ vaultId: "vault" }, expect.any(Function));
    expect(deps.confirmPersonalVault).not.toHaveBeenCalled();
  });

  it.each([true, false])("honors personal-vault confirmation (%s)", async (confirmed) => {
    const { flow, deps, vault } = setup();
    vault.personal = true;
    deps.hasExistingFiles.mockResolvedValue(true);
    deps.confirmPersonalVault.mockResolvedValue(confirmed);
    await expect(flow.connect("vault")).resolves.toBe(confirmed);
    expect(deps.confirmPersonalVault).toHaveBeenCalledOnce();
    expect(deps.bootstrap).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  });

  it.each(["files", "account"])("rechecks %s after bootstrap I/O and before activation", async (change) => {
    const { flow, deps } = setup();
    deps.bootstrap.mockImplementation(async (_input, beforeActivate) => {
      if (change === "files") deps.hasExistingFiles.mockResolvedValue(true);
      else deps.isCurrentAccount.mockReturnValue(false);
      await beforeActivate();
    });
    await expect(flow.connect("vault")).rejects.toThrow(
      t(change === "files" ? "vault.invitedNeedsEmpty" : "sharing.accountChanged"),
    );
  });

  it("fails closed when fresh access data cannot be loaded", async () => {
    const { flow, manager, deps } = setup();
    await flow.list();
    manager.client.organizations.mockRejectedValueOnce(new Error("offline"));
    await expect(flow.connect("vault")).rejects.toThrow("offline");
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });

  it("rejects access revoked after the picker was opened", async () => {
    const { flow, deps, vault } = setup();
    await flow.list();
    vault.status = "revoked";
    await expect(flow.connect("vault")).rejects.toThrow(t("vault.remoteAccessUnavailable"));
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });

  it("rejects account changes while loading or confirming", async () => {
    const { flow, deps, vault } = setup();
    vault.personal = true;
    deps.confirmPersonalVault.mockImplementation(async () => {
      deps.isCurrentAccount.mockReturnValue(false);
      return true;
    });
    await expect(flow.connect("vault")).rejects.toThrow(t("sharing.accountChanged"));
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });

  it("excludes pending_key, revoked, and unassigned vaults", async () => {
    const { flow, organization, vault } = setup();
    vault.status = "pending_key";
    organization.vaults.push({ ...vault, id: "revoked", status: "revoked" }, { ...vault, id: "unassigned", status: null });
    expect(await flow.list()).toEqual([]);
  });

  it("blocks suspended shared vaults even for their owner", async () => {
    const { flow, deps, organization, vault } = setup();
    organization.sharing.enabled = false;
    vault.personal = true;
    await expect(flow.connect("vault")).rejects.toThrow(t("sharing.suspended"));
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });
});
