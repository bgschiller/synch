import { Notice, Setting } from "obsidian";
import { t } from "../../../i18n";
import { submitOnEnter } from "../../keyboard";
import type { SynchSettingsController } from "../controller";

export interface ApiBaseUrlSettingOptions {
  canChangeApiBaseUrl: boolean;
}

export function populateServerUrlSetting(
  setting: Setting,
  controller: SynchSettingsController,
  options: ApiBaseUrlSettingOptions,
): void {
  const apiBaseUrl = controller.getApiBaseUrl();
  let apiBaseUrlInput = apiBaseUrl;
  const saveApiBaseUrl = async (): Promise<void> => {
    try {
      await controller.updateApiBaseUrl(apiBaseUrlInput);
      new Notice(t("server.saved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t("server.saveFailed", { message }));
    }
  };

  setting
    .setName(t("server.url"))
    .setDesc(t("server.urlDesc"))
    .addText((text) => {
      text
        .setPlaceholder(t("server.placeholder"))
        .setValue(apiBaseUrl)
        .setDisabled(!options.canChangeApiBaseUrl)
        .onChange((value) => {
          apiBaseUrlInput = value;
        });
      submitOnEnter(text.inputEl, saveApiBaseUrl);
    })
    .addButton((button) =>
      button
        .setButtonText(t("save"))
        .setDisabled(!options.canChangeApiBaseUrl)
        .onClick(saveApiBaseUrl),
    );
}
