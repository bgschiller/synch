import { describe, expect, it } from "vitest";
import { authReturnTo, supportedReturnUri } from "./navigation";
import { normalizeLocale, translator } from "./i18n";
import { responseError } from "./api";

describe("authentication navigation", () => {
  it("preserves the device code and Obsidian return URI across sign-in", () => {
    const device =
      "http://localhost:3000/device?user_code=ABCD-EFGH&return_uri=obsidian%3A%2F%2Fsynch-device-login&lang=ko";
    expect(
      authReturnTo(
        "ko",
        `http://localhost:3000/signin?return_to=${encodeURIComponent(device)}`,
      ),
    ).toBe(device);
  });
  it.each([
    "https://evil.example",
    "//evil.example/path",
    "javascript:alert(1)",
    "http://localhost:3001/vaults",
    "   ",
  ])("rejects unsafe return destination %s", (destination) => {
    expect(
      authReturnTo(
        "ko",
        `http://localhost:3000/signin?return_to=${encodeURIComponent(destination)}`,
      ),
    ).toBe("http://localhost:3000/vaults?lang=ko");
  });
  it("only allows the registered Obsidian callback", () => {
    expect(supportedReturnUri("obsidian://synch-device-login")).toBe(
      "obsidian://synch-device-login",
    );
    for (const uri of [
      null,
      "https://example.com",
      "obsidian://open",
      "obsidian://synch-device-login?x=1",
    ])
      expect(supportedReturnUri(uri)).toBe("");
  });
});
it("always uses English and loads English parameters", async () => {
  expect(normalizeLocale("zh-Hant-TW")).toBe("en");
  expect(normalizeLocale("ko-KR")).toBe("en");
  const t = await translator("vaults", "en");
  expect(t("title")).toBe("Remote vaults");
  expect(t("countMany", { count: 3 })).toContain("3");
});
it("keeps structured API error objects out of rendered messages", () => {
  expect(
    responseError({ error: { message: "Denied" } }, "Fallback", 403).message,
  ).toBe("Denied");
  expect(responseError({ error: { code: "x" } }, "Fallback", 400).message).toBe(
    "Fallback",
  );
});
