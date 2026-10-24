import { getLanguage } from "obsidian";

import { messages } from "./messages";
import type { SynchErrorContextKey, SynchLocale, SynchMessageKey } from "./types";

export type { SynchErrorContextKey, SynchLocale, SynchMessageKey } from "./types";

export function getSynchLocale(): SynchLocale {
  const language = getLanguage().toLowerCase();
  if (language === "ko" || language.startsWith("ko-")) return "ko";
  if (language === "ja" || language.startsWith("ja-")) return "ja";
  if (language === "de" || language.startsWith("de-")) return "de";
  if (language === "zh-tw" || language === "zh-hk" || language === "zh-hant" || language.startsWith("zh-hant-")) return "zh-tw";
  if (language === "zh" || language === "zh-cn" || language === "zh-sg" || language === "zh-hans" || language.startsWith("zh-hans-")) return "zh-cn";
  return "en";
}

export function t<K extends SynchMessageKey>(
  key: K,
  params?: Parameters<Extract<(typeof messages.en)[K], (...args: never[]) => unknown>>[0],
): string {
  const localeMessages = messages[getSynchLocale()] as Partial<
    Record<SynchMessageKey, (typeof messages.en)[SynchMessageKey]>
  >;
  const value = localeMessages[key] ?? messages.en[key];
  if (typeof value === "function") {
    return value(params as never);
  }
  return value;
}

export function formatErrorNotice(
  error: unknown,
  contextKey: SynchErrorContextKey,
): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "cursor_ahead_of_server"
  ) {
    return t("sync.cursorMismatch");
  }

  const message = error instanceof Error ? error.message : String(error);
  return t("error.detail", { context: t(contextKey), message });
}
