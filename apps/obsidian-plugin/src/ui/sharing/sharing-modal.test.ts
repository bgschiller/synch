import { App } from "obsidian";
import { beforeEach, expect, it, vi } from "vitest";
import type { RemoteVaultSession, SharingManager, SharingVault, VaultKeyRequest } from "@synch/sync-client/remote";
import { getButtonComponents, getCreatedElements, getCreatedElementTexts, getTextComponents, resetObsidianMocks } from "../../test-stubs/obsidian";
import { t } from "../../i18n";
import { SharingModal } from "./sharing-modal";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const request: VaultKeyRequest = {
  id: "request", vaultId: "vault", userId: "me", accessVersion: 1,
  publicKey: "server-key", purpose: "enrollment", status: "approved",
  envelopeJson: null, approvedBy: "admin", createdAt: 1, expiresAt: 2,
};
function setup(connected = false) {
  const vault: SharingVault = {
    id: "vault", name: "test", personal: false, canManage: true,
    status: "active", shared: true, members: [],
  };
  const organization = { name: "Team", sharing: { enabled: true }, vaults: [vault] };
  const manager = {
    userId: "me",
    client: {
      organizations: vi.fn(async () => [organization]),
      requests: vi.fn(async (): Promise<VaultKeyRequest[]> => []),
    },
    localRequest: vi.fn(async (): Promise<VaultKeyRequest | null> => null),
    recipientVerificationCode: vi.fn(async () => "verified-local-code"),
    approve: vi.fn(async () => {}),
  };
  const modal = new SharingModal(new App(), manager as unknown as SharingManager, () => connected ? { summary: { vaultId: vault.id } } as RemoteVaultSession : null, () => true, vi.fn());
  return { organization, manager, modal };
}
beforeEach(resetObsidianMocks);

it("shows connection status and an empty state without tabs", async () => {
  const { modal } = setup();
  modal.open();
  await tick();
  expect(getCreatedElementTexts()).toContain(t("sharing.noRequests"));
  expect(getCreatedElementTexts()).toContain(t("sharing.notConnected"));
  const tabs = getCreatedElements().filter(element => element.attributes.role === "tab");
  expect(tabs).toHaveLength(0);
});

it("leaves personal requests and password setup to Connect vault", async () => {
  const { manager, modal } = setup();
  manager.client.requests.mockResolvedValue([request]);
  modal.open();
  await tick();
  expect(manager.recipientVerificationCode).not.toHaveBeenCalled();
  expect(getTextComponents()).toHaveLength(0);
  expect(getButtonComponents().map(button => button.text)).not.toContain(t("sharing.restart"));
  expect(getButtonComponents().map(button => button.text)).not.toContain(t("sharing.save"));
});

it("directs invited users to Connect vault without password or request controls", async () => {
  const { organization, manager, modal } = setup();
  organization.vaults[0]!.status = "pending_key";
  modal.open();
  await tick();
  expect(getCreatedElementTexts()).toContain(t("sharing.connectToSetUp"));
  expect(getTextComponents()).toHaveLength(0);
  expect(getButtonComponents().map(button => button.text)).not.toContain(t("sharing.request"));
  expect(manager.client.requests).not.toHaveBeenCalled();
  expect(manager.localRequest).not.toHaveBeenCalled();
});

it("explains unavailable sharing without querying requests", async () => {
  const { organization, manager, modal } = setup();
  organization.sharing.enabled = false;
  modal.open();
  await tick();
  expect(getCreatedElementTexts()).toContain(t("sharing.suspended"));
  expect(manager.client.requests).not.toHaveBeenCalled();
});

it("explains an empty organization list", async () => {
  const { manager, modal } = setup();
  manager.client.organizations.mockResolvedValue([]);
  modal.open();
  await tick();
  expect(getCreatedElementTexts()).toContain(t("sharing.noVaults"));
});
