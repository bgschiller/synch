import { beforeEach, describe, expect, it } from "vitest";
import { resetObsidianMocks, setLanguage } from "obsidian";

import { formatErrorNotice, getSynchLocale, t } from "./index";

describe("Synch i18n", () => {
  beforeEach(() => {
    resetObsidianMocks();
  });

  it("always uses English", () => {
    setLanguage("ko-KR");

    expect(getSynchLocale()).toBe("en");
    expect(t("sync.label")).toBe("Sync");
  });

  it("localizes cursor mismatch errors without exposing the server message", () => {
    expect(
      formatErrorNotice(
        Object.assign(new Error("server cursor details"), {
          code: "cursor_ahead_of_server",
        }),
        "Auto sync failed",
      ),
    ).toBe(
      "Sync was paused because this device's sync history no longer matches the remote vault. To resume syncing, disconnect and reconnect the remote vault in Synch settings.",
    );
  });

  it("localizes the context for other errors", () => {
    expect(formatErrorNotice(new Error("request failed"), "error.autoSync")).toBe(
      "Automatic sync failed: request failed",
    );
  });

  it("localizes notification messages with dynamic values", () => {
    expect(t("auth.openingBrowser", { code: "ABCD-EFGH" })).toBe(
      "Opening browser for device sign-in...\nCode: ABCD-EFGH",
    );
    expect(t("sync.conflictLocalSaved", { path: "notes/conflict.md" })).toBe(
      'Sync conflict detected. Your local changes were saved to "notes/conflict.md".',
    );
  });
});
