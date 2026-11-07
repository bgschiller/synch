import { messages } from "./messages";
import type { SynchErrorContextKey, SynchLocale, SynchMessageKey } from "./types";

export type { SynchErrorContextKey, SynchLocale, SynchMessageKey } from "./types";

export function getSynchLocale(): SynchLocale {
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
