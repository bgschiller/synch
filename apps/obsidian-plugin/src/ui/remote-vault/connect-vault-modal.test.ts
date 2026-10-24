import { App } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getButtonComponents, getCreatedElements, getCreatedElementTexts,
  getOpenModals, getTextComponents, resetObsidianMocks,
} from "../../test-stubs/obsidian";
import { t } from "../../i18n";
import { ConnectVaultFlow, type ConnectableVault } from "./connect-vault-flow";
import { openConnectVaultModal } from "./connect-vault-modal";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const button = (label: string) => getButtonComponents().findLast((entry) => entry.text === label)!;
const inlineError = (message: string) => getCreatedElements().some((element) =>
  element.classes.includes("synch-modal-error") && element.text === message,
);

function setup(status: "active" | "revoked" = "active") {
  const item: ConnectableVault = {
    vault: { id: "vault", name: "Team notes", personal: false, canManage: false, status, shared: true, members: [] },
    organizationName: "Team", sharingEnabled: true,
  };
  const flow = {
    assertCurrentAccount: vi.fn(),
    list: vi.fn(async () => [item]),
    blockingReason: vi.fn(async (): Promise<string | null> => null),
    connect: vi.fn(async () => true),
  };
  const open = () => openConnectVaultModal(new App(), flow as unknown as ConnectVaultFlow, null);
  return { item, flow, open };
}

beforeEach(resetObsidianMocks);

describe("connect vault onboarding", () => {
  it("shows a spinner during submission and clears it after failure", async () => {
    const { open, flow } = setup();
    let fail!: (error: Error) => void;
    flow.connect.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    void open();
    await tick();
    await button("Team notes").click();
    const submitButton = button(t("vault.connect"));
    const submission = submitButton.click();
    await tick();
    const spinners = () => getCreatedElements().filter((element) => element.classes.includes("synch-button-spinner"));
    expect(spinners()).toHaveLength(1);
    expect(spinners()[0]?.attributes["data-icon"]).toBe("loader-circle");
    expect(submitButton.disabled).toBe(true);
    fail(new Error("connect failed"));
    await submission;
    await tick();
    expect(spinners()).toHaveLength(0);
    expect(submitButton.disabled).toBe(false);
    expect(inlineError("connect failed")).toBe(true);
  });

  it("offers a direct connection without recovery controls on older servers", async () => {
    const { item, open } = setup();
    item.sharingEnabled = false;
    item.vault.personal = true;
    item.vault.shared = false;
    item.organizationName = "";
    const result = open();
    await tick();
    await button("Team notes").click();
    expect(getTextComponents()).toHaveLength(0);
    expect(getButtonComponents().map(entry => entry.text)).not.toContain(t("sharing.recovery"));
    getOpenModals().at(-1)?.close();
    await expect(result).resolves.toBe(false);
  });

  it("starts with a picker and no password or automatic selection", async () => {
    const { open, flow } = setup();
    void open();
    await tick();
    expect(getTextComponents()).toHaveLength(0);
    expect(flow.blockingReason).not.toHaveBeenCalled();
    expect(getButtonComponents().map((entry) => entry.text)).toEqual([
      t("sharing.refresh"), "Team notes", t("sharing.refresh"),
    ]);
    await button("Team notes").click();
    expect(getTextComponents()).toHaveLength(0);
    await button(t("vault.allVaults")).click();
    expect(getButtonComponents().at(-2)?.text).toBe("Team notes");
    expect(getButtonComponents().at(-1)?.text).toBe(t("sharing.refresh"));
  });

  it("shows organizations and invitation labels, and connects on click", async () => {
    const { open, flow } = setup();
    const result = open();
    await tick();
    await button("Team notes")?.click();
    expect(getCreatedElementTexts()).toContain("Team");
    await button(t("vault.connect")).click();
    expect(flow.connect).toHaveBeenCalledWith("vault");
    await expect(result).resolves.toBe(true);
  });

  it("shows connection errors inline and lets the user retry or cancel", async () => {
    const { open, flow } = setup();
    flow.connect.mockRejectedValueOnce(new Error("Wrong password"));
    const result = open();
    await tick();
    await button("Team notes")?.click();
    await button(t("vault.connect")).click();
    expect(inlineError("Wrong password")).toBe(true);
    getOpenModals().at(-1)?.close();
    await expect(result).resolves.toBe(false);
  });

  it("cannot cancel, change the selected vault, or submit twice while connecting", async () => {
    const { open, flow } = setup();
    let finish!: (connected: boolean) => void;
    flow.connect.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const result = open();
    await tick();
    await button("Team notes")?.click();
    const submit = button(t("vault.connect")).click();
    await tick();
    expect(button(t("vault.allVaults")).disabled).toBe(true);
    getOpenModals().at(-1)?.close();
    expect(getOpenModals()).toHaveLength(1);
    await button(t("vault.connect")).click();
    expect(flow.connect).toHaveBeenCalledOnce();
    finish(true);
    await submit;
    await expect(result).resolves.toBe(true);
  });

  it("shows an empty-vault explanation without password or approval controls when blocked", async () => {
    const { open, flow } = setup("revoked");
    flow.blockingReason.mockResolvedValue(t("vault.invitedNeedsEmpty"));
    void open();
    await tick();
    await button("Team notes")?.click();
    expect(getCreatedElementTexts()).toContain(t("vault.invitedNeedsEmpty"));
    expect(getTextComponents()).toHaveLength(0);
    expect(getButtonComponents().some((entry) => entry.text === t("sharing.request"))).toBe(false);
  });

  it("offers retry after a list error and explains web invitation acceptance for an empty list", async () => {
    const { open, flow } = setup();
    flow.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    void open();
    await tick();
    await button("Team notes")?.click();
    expect(inlineError("offline")).toBe(true);
    await button(t("sharing.refresh")).click();
    expect(getCreatedElementTexts()).toContain(t("vault.noVaults"));
    expect(getCreatedElementTexts()).toContain(t("vault.acceptOnWeb"));
  });

});
