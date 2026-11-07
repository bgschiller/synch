import { App, Setting } from "obsidian";
import { t } from "../../../i18n";
import type { SynchSettingsController } from "../controller";
import { DeletedFilesModal } from "../modals";
import { RefreshSettings } from "./shared";

export function populateVaultManageSetting(
  setting: Setting,
  controller: SynchSettingsController,
): void {
  setting
    .setName(t("vault.manage"))
    .setDesc(t("vault.manageDesc"));

  setting.addButton((button) =>
    button.setButtonText(t("sharing.title")).onClick(() => {
      void controller.openVaultSharing();
    }),
  );

  setting.addButton((button) =>
    button.setButtonText(t("vault.manageRemote")).onClick(() => {
      controller.openRemoteVaultManagementPage();
    }),
  );
}

export function addVaultDisconnectButton(
  setting: Setting,
  controller: SynchSettingsController,
  refresh: RefreshSettings,
): void {
  setting
    .addButton((button) =>
      button.setButtonText(t("sync.disconnect")).onClick(async () => {
        await controller.disconnectRemoteVault();
        refresh();
      }),
    );
}

export function populateDeletedFilesSetting(
  setting: Setting,
  app: App,
  controller: SynchSettingsController,
  refresh: RefreshSettings,
): void {
  setting
    .setName(t("deleted.header"))
    .setDesc(t("vault.deletedFilesDesc"))
    .addButton((button) =>
      button.setButtonText(t("vault.viewDeletedFiles")).onClick(() => {
        new DeletedFilesModal(app, {
          listDeletedFiles: async (before, limit) =>
            await controller.listDeletedFiles(before, limit),
          previewDeletedFile: async (entryId, fallbackPath) =>
            await controller.previewDeletedFile(entryId, fallbackPath),
          restoreDeletedFiles: async (files) => {
            const result = await controller.restoreDeletedFiles(files);
            refresh();
            return result;
          },
          purgeDeletedFiles: async (files) => {
            const result = await controller.purgeDeletedFiles(files);
            refresh();
            return result;
          },
        }).open();
      }),
    );
}
