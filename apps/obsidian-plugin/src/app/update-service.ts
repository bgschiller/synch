import { t } from "../i18n";
import type { SynchServerCompatibilityStatus } from "../ui/contracts";
import {
  SUPPORTED_SYNCH_API_MAJOR,
  SynchServerPluginVersionChecker,
} from "./server-version-checker";

export interface SynchPluginUpdateServiceDeps {
  getApiBaseUrl: () => string;
  getPluginVersion: () => string;
  refreshUi: () => void;
  onPluginUpdateRequired: () => void;
  notify: (message: string, timeout?: number) => void;
}

export class SynchPluginUpdateService {
  private readonly serverPluginVersionChecker = new SynchServerPluginVersionChecker();
  private serverCompatibilityStatus: SynchServerCompatibilityStatus = {
    state: "idle",
  };

  constructor(private readonly deps: SynchPluginUpdateServiceDeps) {}

  getServerCompatibilityStatus(): SynchServerCompatibilityStatus {
    return this.serverCompatibilityStatus;
  }

  isPluginUpdateRequired(): boolean {
    return (
      this.serverCompatibilityStatus.state === "update_required" ||
      this.serverCompatibilityStatus.state === "incompatible"
    );
  }

  getPluginUpdateRequiredMessage(): string {
    if (
      this.serverCompatibilityStatus.state !== "update_required" &&
      this.serverCompatibilityStatus.state !== "incompatible"
    ) {
      return t("plugin.updateRequiredStatus");
    }

    return this.serverCompatibilityStatus.message;
  }

  async checkServerCompatibility(): Promise<void> {
    try {
      const status = await this.serverPluginVersionChecker.check(
        this.deps.getApiBaseUrl(),
        this.deps.getPluginVersion(),
      );
      if (status.apiMajor !== SUPPORTED_SYNCH_API_MAJOR) {
        this.serverCompatibilityStatus = {
          state: "incompatible",
          currentVersion: this.deps.getPluginVersion(),
          minVersion: status.minVersion,
          apiMajor: status.apiMajor,
          message: t("plugin.serverIncompatible"),
        };
        this.deps.onPluginUpdateRequired();
        this.deps.notify(this.getPluginUpdateRequiredMessage(), 0);
        this.deps.refreshUi();
        return;
      }

      if (status.status !== "update_required") {
        this.serverCompatibilityStatus = {
          state: "ok",
          currentVersion: this.deps.getPluginVersion(),
          minVersion: status.minVersion,
          apiMajor: status.apiMajor,
        };
        return;
      }

      this.serverCompatibilityStatus = {
        state: "update_required",
        currentVersion: this.deps.getPluginVersion(),
        minVersion: status.minVersion,
        message: t("plugin.latestAvailable"),
      };
      this.deps.onPluginUpdateRequired();
      this.deps.notify(this.getPluginUpdateRequiredMessage(), 0);
      this.deps.refreshUi();
    } catch {
      // Only a confirmed server policy response should block sync startup.
    }
  }

}
