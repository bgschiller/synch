import { App } from "obsidian";
import { beforeEach, expect, it, vi } from "vitest";
import type { RemoteVaultSession, SharingManager, SharingVault } from "@synch/sync-client/remote";
import { getButtonComponents, getCreatedElements, getCreatedElementTexts, getTextComponents, resetObsidianMocks } from "../../test-stubs/obsidian";
import { t } from "../../i18n";
import { SharingModal } from "./sharing-modal";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function setup(connected = false) {
  const vault: SharingVault = {
    id: "vault", name: "test", personal: false, canManage: true,
    status: "active", shared: true, members: [],
  };
  const organization = { name: "Team", sharing: { enabled: true }, vaults: [vault] };
  const manager = {
    userId: "me",
    client: { organizations: vi.fn(async () => [organization]) },
  };
  const modal = new SharingModal(new App(), manager as unknown as SharingManager, () => connected ? { summary: { vaultId: vault.id } } as RemoteVaultSession : null, () => true, vi.fn());
  return { organization, manager, modal };
}
beforeEach(resetObsidianMocks);

it("shows connection status without tabs", async () => {
  const { modal } = setup();
  modal.open();
  await tick();
  expect(getCreatedElementTexts()).toContain(t("sharing.notConnected"));
  const tabs = getCreatedElements().filter(element => element.attributes.role === "tab");
  expect(tabs).toHaveLength(0);
});

it("leaves password setup to Connect vault", async () => {
  const { modal } = setup();
  modal.open();
  await tick();
  expect(getTextComponents()).toHaveLength(0);
  expect(getButtonComponents().map(button => button.text)).not.toContain(t("sharing.restart"));
  expect(getButtonComponents().map(button => button.text)).not.toContain(t("sharing.save"));
});

it("marks pending access without request controls", async () => {
  const { organization, modal } = setup();
  organization.vaults[0]!.status = "pending_key";
  modal.open();
  await tick();
  expect(getCreatedElementTexts()).toContain(t("sharing.accessNeeded"));
  expect(getTextComponents()).toHaveLength(0);
  expect(getButtonComponents().map(button => button.text)).not.toContain(t("sharing.request"));
});

it("explains unavailable sharing", async () => {
  const { organization, modal } = setup();
  organization.sharing.enabled = false;
  modal.open();
  await tick();
  expect(getCreatedElementTexts()).toContain(t("sharing.suspended"));
});

it("explains an empty organization list", async () => {
  const { manager, modal } = setup();
  manager.client.organizations.mockResolvedValue([]);
  modal.open();
  await tick();
  expect(getCreatedElementTexts()).toContain(t("sharing.noVaults"));
});

it("offers to create and manage organizations", async () => {
  const { organization, modal } = setup();
  (organization as unknown as { role: string }).role = "owner";
  modal.open();
  await tick();
  const texts = getButtonComponents().map(button => button.text);
  expect(texts).toContain(t("sharing.newOrganization"));
  expect(texts).toContain(t("sharing.inviteMember"));
});
