import { App, Modal, Notice, Setting, setIcon, type ButtonComponent } from "obsidian";
import {
  SharingManager,
  type SharingVault,
  type RemoteVaultSession,
} from "@synch/sync-client/remote";
import { t } from "../../i18n";
import { showButtonLoading } from "../button-loading";

export class SharingModal extends Modal {
  private closed = false;
  private busy = false;
  private controls: ButtonComponent[] = [];
  constructor(
    app: App,
    private readonly manager: SharingManager,
    private readonly activeSession: () => RemoteVaultSession | null,
    private readonly isCurrentAccount: () => boolean,
    private readonly openOrganizations: () => void,
  ) {
    super(app);
  }
  onOpen(): void {
    this.modalEl.addClass("synch-sharing-modal");
    this.contentEl.addClass("synch-sharing");
    void this.run(async () => {});
  }
  onClose(): void {
    this.closed = true;
    this.contentEl.empty();
  }
  private async run(action: () => Promise<void>, button?: ButtonComponent): Promise<void> {
    if (this.busy || this.closed) return;
    if (!this.isCurrentAccount()) {
      new Notice(t("sharing.accountChanged"));
      this.close();
      return;
    }
    this.busy = true;
    this.controls.forEach((control) => { control.setDisabled(true); });
    const stopLoading = button ? showButtonLoading(button) : undefined;
    try {
      await action();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error), 10000);
    } finally {
      try {
        if (!this.closed) await this.refresh();
      } finally {
        stopLoading?.();
        this.busy = false;
        this.controls.forEach((control) => { control.setDisabled(false); });
      }
    }
  }
  private async refresh(): Promise<void> {
    if (this.closed) return;
    this.controls = [];
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: t("sharing.title") });
    const body = this.contentEl.createDiv();
    body.setAttribute("aria-live", "polite");
    const loading = body.createEl("p", { text: t("sharing.loading"), cls: "synch-sharing-hint" });
    const footer = this.contentEl.createDiv({ cls: "synch-sharing-footer" });
    new Setting(footer).addButton((button) => {
      button.setButtonText(t("sharing.organizations")).onClick(this.openOrganizations);
      button.setDisabled(this.busy);
      this.controls.push(button);
      button.buttonEl.addClass("synch-sharing-web-link");
      setIcon(button.buttonEl.createSpan(), "arrow-up-right");
    });
    let stopLoading: (() => void) | undefined;
    new Setting(footer).addButton((button) => {
      button.setButtonText(t("sharing.refresh")).setDisabled(this.busy).onClick(() => {
        void this.run(async () => {}, button);
      });
      this.controls.push(button);
      stopLoading = showButtonLoading(button);
    });
    try {
      const organizations = await this.manager.client.organizations();
      if (this.closed) return;
      loading.remove();
      let vaultCount = 0;
      for (const organization of organizations) {
        const vaults = organization.vaults.filter(
          (vault) =>
            vault.status === "active" || vault.status === "pending_key",
        );
        if (!vaults.length) continue;
        vaultCount += vaults.length;
        for (const vault of vaults) {
          try {
            this.renderVault(body, vault, organization.sharing.enabled, organization.name);
            if (this.closed) return;
          } catch (error) {
            body.createEl("p", {
              text: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      if (!vaultCount) body.createEl("p", { text: t("sharing.noVaults"), cls: "synch-sharing-empty" });
    } catch (error) {
      if (this.closed) return;
      loading.remove();
      body.createEl("p", {
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      stopLoading?.();
    }
  }
  private renderVault(
    parent: HTMLElement,
    vault: SharingVault,
    canShare: boolean,
    organizationName: string,
  ): void {
    const section = parent.createDiv({ cls: "synch-sharing-vault" });
    const header = section.createDiv({ cls: "synch-sharing-vault-header" });
    setIcon(header.createSpan({ cls: "synch-sharing-vault-icon" }), "vault");
    const heading = header.createDiv({ cls: "synch-sharing-vault-heading" });
    heading.createEl("h3", { text: vault.name });
    heading.createEl("p", { text: organizationName, cls: "synch-sharing-hint" });
    const isActiveVault = this.activeSession()?.summary.vaultId === vault.id;
    header.createSpan({
      text: t(vault.status === "pending_key" ? "sharing.accessNeeded" : isActiveVault ? "sharing.connected" : "sharing.notConnected"),
      cls: "synch-sharing-badge",
    });
    const access = section.createDiv({ cls: "synch-sharing-panel" });
    if (!canShare) {
      access.createEl("p", { text: t(vault.shared ? "sharing.suspended" : "sharing.unavailable"), cls: "synch-sharing-empty" });
    }
  }
}
