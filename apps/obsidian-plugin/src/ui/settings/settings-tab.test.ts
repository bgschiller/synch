import type {
  Setting as ObsidianSetting,
  SettingGroup,
} from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../../i18n";
import {
  getButtonComponents,
  getNotices,
  getProgressBarComponents,
  getSettingDescriptions,
  getSettingNames,
  getTextComponents,
  resetObsidianMocks,
  Setting,
} from "../../test-stubs/obsidian";
import { createSettingsTab } from "./__tests__/settings-tab-helpers";

describe("SynchSettingTab", () => {
  beforeEach(() => {
    resetObsidianMocks();
  });

  it("offers to reopen or cancel the sign-in page while device login is in progress", async () => {
    let isDeviceLoginInProgress = true;
    const cancelDeviceLogin = vi.fn(() => {
      isDeviceLoginInProgress = false;
    });
    const tab = createSettingsTab({
      isDeviceLoginInProgress: () => isDeviceLoginInProgress,
      cancelDeviceLogin,
    });

    tab.open();

    expect(getButtonComponents().slice(0, 2).map((button) => button.text)).toEqual([
      t("auth.openSignInAgain"),
      t("cancel"),
    ]);

    await getButtonComponents()[1]?.click();

    expect(cancelDeviceLogin).toHaveBeenCalledTimes(1);

    // The obsidian stub appends rendered buttons rather than replacing them,
    // so reset before re-opening to assert against the fresh render.
    resetObsidianMocks();
    tab.open();
    expect(getButtonComponents()[0]?.text).toBe(t("auth.signInOnThisDevice"));
  });

  it("shows the normal sign-in button when device login is idle", () => {
    const tab = createSettingsTab({
      isDeviceLoginInProgress: () => false,
    });

    tab.open();

    const signInButton = getButtonComponents()[0];
    expect(signInButton?.text).toBe(t("auth.signInOnThisDevice"));
    expect(signInButton?.disabled).toBe(false);
    expect(getButtonComponents().map((button) => button.text)).not.toContain(
      t("cancel"),
    );
  });

  it("shows account before server settings before sign-in", () => {
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => false,
    });

    tab.open();

    const buttonTexts = getButtonComponents().map((button) => button.text);
    expect(getSettingNames().slice(0, 4)).toEqual([
      t("account"),
      t("authentication"),
      t("server.heading"),
      t("server.url"),
    ]);
    expect(buttonTexts).toEqual([t("auth.signInOnThisDevice"), t("save")]);
    expect(getProgressBarComponents()).toEqual([]);
  });

  it("only asks for network connection when stored sign-in needs online verification", () => {
    const tab = createSettingsTab({
      getAuthReadiness: () => ({
        state: "pending_network",
        token: "stored-token",
      }),
      getAuthStatusLabel: () => t("network.requiredDesc"),
      hasAuthenticatedSession: () => false,
    });

    tab.open();

    expect(getSettingNames()).toEqual([t("network.required")]);
    expect(getSettingDescriptions()).toContain(t("network.requiredDesc"));
    expect(getButtonComponents()).toEqual([]);
    expect(getTextComponents()).toEqual([]);
  });

  it("shows required plugin updates as a sync blocker", () => {
    const tab = createSettingsTab({
      getServerCompatibilityStatus: () => ({
        state: "update_required",
        currentVersion: "0.0.1",
        minVersion: "1.2.0",
        message: "Update Synch before syncing.",
      }),
      hasAuthenticatedSession: () => true,
      hasConnectedRemoteVault: () => true,
    });

    tab.open();

    expect(getSettingNames()).toContain(t("plugin.updateRequired"));
    expect(getSettingNames()).toContain(t("sync.paused"));
    expect(getSettingDescriptions()).toContain("Update Synch before syncing.");
    expect(getButtonComponents().map((button) => button.text)).toContain(
      t("plugin.openCommunityPlugins"),
    );
    expect(getButtonComponents().map((button) => button.text)).not.toContain(t("sync.start"));
  });

  it("shows an editable self-hosted server URL before sign-in when already configured", async () => {
    const updateApiBaseUrl = vi.fn(async () => {});
    const tab = createSettingsTab({
      getApiBaseUrl: () => "https://api.synch.test",
      updateApiBaseUrl,
    });

    tab.open();

    const apiBaseUrlInput = getTextComponents()[0];
    expect(apiBaseUrlInput?.value).toBe("https://api.synch.test");
    expect(apiBaseUrlInput?.disabled).toBe(false);

    const saveButton = getButtonComponents()[1];
    expect(saveButton?.text).toBe(t("save"));
    expect(saveButton?.disabled).toBe(false);

    await apiBaseUrlInput?.change("https://custom.synch.test");
    expect(updateApiBaseUrl).not.toHaveBeenCalled();

    await saveButton?.click();
    expect(updateApiBaseUrl).toHaveBeenCalledWith("https://custom.synch.test");
    expect(getNotices()).toContainEqual({ message: t("server.saved") });
  });

  it("saves the self-hosted server URL when Enter is pressed", async () => {
    const updateApiBaseUrl = vi.fn(async () => {});
    const tab = createSettingsTab({
      getApiBaseUrl: () => "https://api.synch.test",
      updateApiBaseUrl,
    });

    tab.open();

    const apiBaseUrlInput = getTextComponents()[0];
    await apiBaseUrlInput?.change("https://custom.synch.test");
    await apiBaseUrlInput?.pressKey("Enter");

    expect(updateApiBaseUrl).toHaveBeenCalledWith("https://custom.synch.test");
    expect(getNotices()).toContainEqual({ message: t("server.saved") });
  });

  it("does not show the self-hosted server URL saved notice when saving fails", async () => {
    const updateApiBaseUrl = vi.fn(async () => {
      throw new Error("API base URL must be a valid http:// or https:// URL.");
    });
    const tab = createSettingsTab({
      getApiBaseUrl: () => "https://api.synch.test",
      updateApiBaseUrl,
    });

    tab.open();

    await getTextComponents()[0]?.change("not-a-url");
    await getButtonComponents()[1]?.click();

    expect(getNotices()).toEqual([
      {
        message: t("server.saveFailed", {
          message: "API base URL must be a valid http:// or https:// URL.",
        }),
        timeout: undefined,
      },
    ]);
    expect(getNotices()[0]?.message).toContain(
      "API base URL must be a valid http:// or https:// URL.",
    );
  });

  it("shows the default API base URL before sign-in", async () => {
    const updateApiBaseUrl = vi.fn(async () => {});
    const tab = createSettingsTab({
      getApiBaseUrl: () => "https://api.synch.run",
      updateApiBaseUrl,
    });

    tab.open();

    expect(getTextComponents()[0]?.value).toBe("https://api.synch.run");
    expect(getButtonComponents().map((button) => button.text)).toContain(t("save"));
    expect(updateApiBaseUrl).not.toHaveBeenCalled();
  });

  it("hides the self-hosted server URL after sign-in", () => {
    const updateApiBaseUrl = vi.fn(async () => {});
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => true,
      getApiBaseUrl: () => "https://api.synch.test",
      updateApiBaseUrl,
    });

    tab.open();

    expect(getSettingNames()).not.toContain(t("server.url"));
    expect(getTextComponents()).toEqual([]);
    expect(getButtonComponents().map((button) => button.text)).not.toContain(t("save"));
    expect(updateApiBaseUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
    [null, false],
  ] as const)("limits management settings for organization role %s", (role, management) => {
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => true,
      hasConnectedRemoteVault: () => true,
      getOrganizationRole: () => role,
    });

    tab.open();

    expect(getSettingNames().includes(t("vault.manage"))).toBe(management);
    expect(getSettingNames()).toContain(t("sync.label"));
  });

  it.each([
    ["https://server.example", true, true],
    ["https://server.example", false, false],
    ["https://api.synch.run", true, true],
  ] as const)("preserves legacy management for %s only when the API is unavailable (%s)", (url, unavailable, management) => {
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => true,
      hasConnectedRemoteVault: () => true,
      getApiBaseUrl: () => url,
      getOrganizationRole: () => null,
      isOrganizationRoleApiUnavailable: () => unavailable,
    });

    tab.open();

    expect(getSettingNames().includes(t("vault.manage"))).toBe(management);
  });

  it("disables the self-hosted server URL during device sign-in", async () => {
    const updateApiBaseUrl = vi.fn(async () => {});
    const tab = createSettingsTab({
      isDeviceLoginInProgress: () => true,
      getApiBaseUrl: () => "https://api.synch.test",
      updateApiBaseUrl,
    });

    tab.open();

    const apiBaseUrlInput = getTextComponents()[0];
    const saveButton = getButtonComponents().find((button) => button.text === t("save"));
    expect(apiBaseUrlInput?.disabled).toBe(true);
    expect(saveButton?.disabled).toBe(true);

    await apiBaseUrlInput?.change("https://custom.synch.test");
    await saveButton?.click();

    expect(updateApiBaseUrl).not.toHaveBeenCalled();
  });

  it("disables the self-hosted server URL while a vault is connected", async () => {
    const updateApiBaseUrl = vi.fn(async () => {});
    const tab = createSettingsTab({
      hasConnectedRemoteVault: () => true,
      getApiBaseUrl: () => "https://api.synch.test",
      updateApiBaseUrl,
    });

    tab.open();

    const apiBaseUrlInput = getTextComponents()[0];
    const saveButton = getButtonComponents()[1];
    expect(apiBaseUrlInput?.disabled).toBe(true);
    expect(saveButton?.disabled).toBe(true);

    await apiBaseUrlInput?.change("https://custom.synch.test");
    await saveButton?.click();

    expect(updateApiBaseUrl).not.toHaveBeenCalled();
  });

  it("hides the sign-in button and shows sign out when already signed in", () => {
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => true,
      isDeviceLoginInProgress: () => false,
    });

    tab.open();

    const buttonTexts = getButtonComponents().map((button) => button.text);
    expect(buttonTexts).not.toContain(t("auth.signInOnThisDevice"));
    expect(buttonTexts).not.toContain(t("auth.openSignInAgain"));
    expect(buttonTexts).not.toContain(t("cancel"));
    expect(buttonTexts).toContain(t("auth.signOut"));
  });

  it("hides sign out before sign-in", () => {
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => false,
    });

    tab.open();

    const buttonTexts = getButtonComponents().map((button) => button.text);
    expect(buttonTexts).toContain(t("auth.signInOnThisDevice"));
    expect(buttonTexts).not.toContain(t("auth.signOut"));
  });

  it("does not own remote storage usage watching while visible", () => {
    const watchStorageStatus = vi.fn();
    const unwatchStorageStatus = vi.fn();
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => true,
      hasConnectedRemoteVault: () => true,
      watchStorageStatus,
      unwatchStorageStatus,
    });

    tab.open();
    tab.open();
    tab.hide();

    expect(watchStorageStatus).not.toHaveBeenCalled();
    expect(unwatchStorageStatus).not.toHaveBeenCalled();
  });

  it("does not watch remote storage usage when a hidden settings tab refreshes", () => {
    const watchStorageStatus = vi.fn();
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => true,
      hasConnectedRemoteVault: () => true,
      watchStorageStatus,
    });

    tab.refresh();

    expect(watchStorageStatus).toHaveBeenCalledTimes(0);
  });

  it("does not watch remote storage usage without a connected vault", () => {
    const watchStorageStatus = vi.fn();
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => true,
      hasConnectedRemoteVault: () => false,
      watchStorageStatus,
    });

    tab.open();

    expect(watchStorageStatus).toHaveBeenCalledTimes(0);
  });

  // Obsidian's declarative settings renderer only keeps the DOM nodes it
  // tracks: after each render pass the group's children are reset to the
  // definitions' settingEls, so content rendered outside the provided row
  // (e.g. into group.listEl) is silently discarded and a removed row is
  // re-attached empty.
  it("keeps declarative render output inside the tracked setting row", () => {
    const scenarios = [
      {},
      { hasAuthenticatedSession: () => true, hasConnectedRemoteVault: () => true },
      {
        getAuthReadiness: () => ({
          state: "pending_network" as const,
          token: "stored-token",
        }),
        // The network-required row has no render callback; a required
        // update keeps this scenario exercising a rendered row.
        getServerCompatibilityStatus: () => ({
          state: "update_required" as const,
          currentVersion: "0.0.1",
          minVersion: "1.2.0",
          message: "Update Synch before syncing.",
        }),
      },
    ];

    for (const overrides of scenarios) {
      const tab = createSettingsTab(overrides);
      const renderDefinitions = collectRenderDefinitions(tab.getSettingDefinitions());
      expect(renderDefinitions.length).toBeGreaterThan(0);

      for (const definition of renderDefinitions) {
        const setting = new Setting(null);
        let usedGroupListEl = false;
        const group = {
          get listEl(): unknown {
            usedGroupListEl = true;
            return undefined;
          },
        };

        definition.render(
          setting as unknown as ObsidianSetting,
          group as unknown as SettingGroup,
        );

        expect(setting.settingEl.detached).toBe(false);
        expect(usedGroupListEl).toBe(false);
      }
    }
  });

  it("exposes declarative setting definitions for Obsidian settings search", () => {
    const tab = createSettingsTab({
      hasAuthenticatedSession: () => true,
      hasConnectedRemoteVault: () => true,
    });

    const definitions = tab.getSettingDefinitions();
    const names = collectSettingNames(definitions);

    expect(definitions.length).toBeGreaterThan(0);
    expect(names).toEqual(
      expect.arrayContaining([
        t("sync.label"),
        t("images"),
        t("sync.frequency"),
        t("diagnostics.header"),
      ]),
    );
  });

});

interface RenderDefinition {
  render: (setting: ObsidianSetting, group: SettingGroup) => unknown;
}

function collectRenderDefinitions(definitions: unknown[]): RenderDefinition[] {
  const found: RenderDefinition[] = [];
  for (const definition of definitions) {
    if (!definition || typeof definition !== "object") {
      continue;
    }
    const record = definition as { render?: unknown; items?: unknown[] };
    if (typeof record.render === "function") {
      found.push(record as RenderDefinition);
    }
    if (Array.isArray(record.items)) {
      found.push(...collectRenderDefinitions(record.items));
    }
  }
  return found;
}

function collectSettingNames(definitions: unknown[]): string[] {
  const names: string[] = [];
  for (const definition of definitions) {
    if (!definition || typeof definition !== "object") {
      continue;
    }
    const record = definition as {
      name?: unknown;
      heading?: unknown;
      items?: unknown[];
    };
    if (typeof record.name === "string") {
      names.push(record.name);
    }
    if (typeof record.heading === "string") {
      names.push(record.heading);
    }
    if (Array.isArray(record.items)) {
      names.push(...collectSettingNames(record.items));
    }
  }
  return names;
}
