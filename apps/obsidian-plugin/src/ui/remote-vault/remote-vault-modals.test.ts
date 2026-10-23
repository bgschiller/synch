import { App } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getButtonComponents,
  getCreatedElementTexts,
  getTextComponents,
  resetObsidianMocks,
} from "../../test-stubs/obsidian";
import { t } from "../../i18n";
import {
  openConfirmConnectNonEmptyLocalVaultModal,
  openCreateRemoteVaultModal,
} from "./remote-vault-modals";

describe("create vault modal", () => {
  beforeEach(() => {
    resetObsidianMocks();
  });

  it("disables create while the name is empty", async () => {
    void openCreateRemoteVaultModal(new App(), "   ");

    const createButton = getButtonComponents().find((button) => button.text === "Create vault");
    const [nameInput] = getTextComponents();

    expect(createButton?.disabled).toBe(true);

    await nameInput?.change("Personal");

    expect(createButton?.disabled).toBe(false);
  });

  it("submits once a name is provided", async () => {
    const modalResult = openCreateRemoteVaultModal(new App(), "Personal");

    const createButton = getButtonComponents().find((button) => button.text === "Create vault");
    void createButton?.click();
    await Promise.resolve();

    await expect(modalResult).resolves.toEqual({ name: "Personal" });
  });

  it("submits when Enter is pressed in the name field", async () => {
    const modalResult = openCreateRemoteVaultModal(new App(), "Personal");

    const [nameInput] = getTextComponents();
    await nameInput?.pressKey("Enter");

    await expect(modalResult).resolves.toEqual({ name: "Personal" });
  });
});

describe("connect non-empty local vault confirmation modal", () => {
  beforeEach(() => {
    resetObsidianMocks();
  });

  it("explains the conflict risk without detailed sync behavior", () => {
    void openConfirmConnectNonEmptyLocalVaultModal(new App());

    expect(getCreatedElementTexts()).toContain(t("vault.connectExistingConflict"));
    expect(getButtonComponents().map((button) => button.text)).toEqual([
      t("cancel"),
      t("connectAnyway"),
    ]);
  });

  it("resolves false when canceled and true when confirmed", async () => {
    const canceled = openConfirmConnectNonEmptyLocalVaultModal(new App());
    await getButtonComponents().find((button) => button.text === "Cancel")?.click();
    await expect(canceled).resolves.toBe(false);

    resetObsidianMocks();

    const confirmed = openConfirmConnectNonEmptyLocalVaultModal(new App());
    await getButtonComponents()
      .find((button) => button.text === "Connect anyway")
      ?.click();
    await expect(confirmed).resolves.toBe(true);
  });
});
