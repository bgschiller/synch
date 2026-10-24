import { App, Modal, Notice, Setting, setIcon, type ButtonComponent } from "obsidian";
import {
  SharingManager,
  type SharingVault,
  type RemoteVaultSession,
} from "@synch/sync-client/remote";
import { t } from "../../i18n";
import { showButtonLoading } from "../button-loading";
import { submitOnEnter } from "../keyboard";

class TextPromptModal extends Modal {
  private resolver: ((value: string | null) => void) | null = null;
  private value: string | null = null;
  constructor(
    app: App,
    private readonly title: string,
    private readonly placeholder: string,
    private readonly submitLabel: string,
  ) {
    super(app);
  }
  openAndWait(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.open();
    });
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.title });
    let value = "";
    new Setting(contentEl).addText((text) => {
      text.setPlaceholder(this.placeholder).onChange((v) => { value = v.trim(); });
      submitOnEnter(text.inputEl, () => this.submit(value));
    });
    new Setting(contentEl).addButton((button) => {
      button.setButtonText(this.submitLabel).setCta().onClick(() => this.submit(value));
    });
  }
  private submit(value: string): void {
    this.value = value || null;
    this.close();
  }
  onClose(): void {
    const resolver = this.resolver;
    this.resolver = null;
    if (resolver) resolver(this.value);
  }
}

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
    new Setting(footer).addButton((button) => {
      button.setButtonText(t("sharing.newOrganization")).setDisabled(this.busy).onClick(() => {
        void this.run(() => this.createOrganization(), button);
      });
      this.controls.push(button);
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
        const section = body.createDiv({ cls: "synch-sharing-org" });
        const header = section.createDiv({ cls: "synch-sharing-org-header" });
        header.createEl("h3", { text: organization.name });
        if (organization.role === "owner" || organization.role === "admin") {
          new Setting(header).addButton((button) => {
            button.setButtonText(t("sharing.inviteMember")).setDisabled(this.busy).onClick(() => {
              void this.run(() => this.inviteMember(organization), button);
            });
            this.controls.push(button);
          });
        }
        const vaults = organization.vaults.filter(
          (vault) =>
            vault.status === "active",
        );
        if (!vaults.length) continue;
        vaultCount += vaults.length;
        for (const vault of vaults) {
          try {
            this.renderVault(section, vault, organization.sharing.enabled, organization.name);
            if (this.closed) return;
          } catch (error) {
            section.createEl("p", {
              text: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      if (!vaultCount && !organizations.length)
        body.createEl("p", { text: t("sharing.noVaults"), cls: "synch-sharing-empty" });
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
  private async createOrganization(): Promise<void> {
    const name = await new TextPromptModal(
      this.app,
      t("sharing.newOrganization"),
      t("sharing.organizationNamePlaceholder"),
      t("sharing.create"),
    ).openAndWait();
    if (!name) return;
    const created = await this.manager.client.createOrganization(name);
    new Notice(t("sharing.created", { name: created.name }));
  }
  private async inviteMember(organization: { id: string; name: string }): Promise<void> {
    const email = await new TextPromptModal(
      this.app,
      `${t("sharing.inviteMember")} — ${organization.name}`,
      t("sharing.memberEmailPlaceholder"),
      t("sharing.invite"),
    ).openAndWait();
    if (!email) return;
    await this.manager.client.inviteMember(organization.id, email, "member");
    new Notice(t("sharing.invited", { email }));
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
      text: t(isActiveVault ? "sharing.connected" : "sharing.notConnected"),
      cls: "synch-sharing-badge",
    });
    const access = section.createDiv({ cls: "synch-sharing-panel" });
    if (!canShare) {
      access.createEl("p", { text: t(vault.shared ? "sharing.suspended" : "sharing.unavailable"), cls: "synch-sharing-empty" });
    }
  }
}
