import {
  formatErrorNotice,
  t,
  type SynchErrorContextKey,
} from "../../i18n";
import { RemoteVaultInputError } from "@synch/sync-client/remote";

// Translates coded domain errors thrown by feature layers into user-facing
// messages, then applies the shared error notice format.
export function formatSynchErrorNotice(
  error: unknown,
  contextKey: SynchErrorContextKey,
): string {
  return formatErrorNotice(localizeDomainError(error), contextKey);
}

function localizeDomainError(error: unknown): unknown {
  if (error instanceof RemoteVaultInputError) {
    switch (error.failure.kind) {
      case "name_required":
        return new Error(t("vault.nameRequired"));
    }
  }

  return error;
}
