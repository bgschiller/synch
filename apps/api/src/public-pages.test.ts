import { URL } from "node:url";
import { readdir, readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pages = [
  "device",
  "signin",
  "signup",
  "vaults",
  "organizations",
  "invitations",
];
const publicDir = new URL("../public/", import.meta.url);
const localesDir = new URL("../web/src/locales/", import.meta.url);
type Catalog = Record<string, Record<string, string>>;

describe("built API public pages", () => {
  it.each(pages)(
    "serves %s with existing module, stylesheet, and favicon assets",
    async (page) => {
      const html = await readFile(new URL(`${page}.html`, publicDir), "utf8");
      expect(html).toContain('<div id="root"></div>');
      expect(html).toMatch(
        /<script type="module"[^>]*src="\/assets\/[^\"]+\.js"/,
      );
      expect(html).toMatch(
        /<link rel="stylesheet"[^>]*href="\/assets\/[^\"]+\.css"/,
      );
      expect(html).toContain('href="/favicon.ico"');
      for (const [, asset] of html.matchAll(/(?:src|href)="\/([^\"]+)"/g)) {
        expect((await stat(new URL(asset, publicDir))).isFile(), asset).toBe(
          true,
        );
      }
      expect(html).not.toContain("/src/");
      expect(html).not.toContain("<script>");
    },
  );
});

describe("API page translation catalogs", () => {
  it("keeps every locale's keys and interpolation parameters in sync with English", async () => {
    const english: Catalog = JSON.parse(
      await readFile(new URL("en.json", localesDir), "utf8"),
    );
    expect(Object.keys(english).sort()).toEqual([...pages].sort());
    const locales = (await readdir(localesDir)).filter(
      (name) => name.endsWith(".json") && name !== "en.json",
    );
    expect(locales.sort()).toEqual([]);
    const parameters = (message: string) =>
      [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const locale of locales) {
      const catalog: Catalog = JSON.parse(
        await readFile(new URL(locale, localesDir), "utf8"),
      );
      expect(Object.keys(catalog).sort(), locale).toEqual([...pages].sort());
      for (const page of pages) {
        expect(Object.keys(catalog[page]).sort(), `${locale}:${page}`).toEqual(
          Object.keys(english[page]).sort(),
        );
        for (const [key, message] of Object.entries(english[page])) {
          expect(
            parameters(catalog[page][key]),
            `${locale}:${page}:${key}`,
          ).toEqual(parameters(message));
        }
      }
    }
  });
});
