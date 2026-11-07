import english from "../locales/en.json";

export type Page = keyof typeof english;
export type MessageKey<P extends Page> = P extends Page
  ? keyof (typeof english)[P] & string
  : never;
export type Translator<P extends Page> = (
  key: MessageKey<P>,
  params?: Record<string, string | number>,
) => string;
export interface PageProps<P extends Page> {
  t: Translator<P>;
  locale: string;
}

export function normalizeLocale(_candidate: string | null | undefined): string {
  return "en";
}

export function getLocale(): string {
  return "en";
}

export async function translator<P extends Page>(
  page: P,
  _locale: string,
): Promise<Translator<P>> {
  const fallback: Record<string, string> = english[page];
  return (key, params = {}) =>
    Object.entries(params).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      fallback[key] || key,
    );
}
