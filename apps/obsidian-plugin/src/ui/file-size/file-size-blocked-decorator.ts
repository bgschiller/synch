import { setIcon, setTooltip, type Plugin } from "obsidian";

import { t } from "../../i18n";
import type { SynchBlockedSyncFile } from "../contracts";

const FILE_EXPLORER_VIEW_TYPE = "file-explorer";
const FILE_TITLE_SELECTOR = ".nav-file-title[data-path]";
const BLOCKED_CLASS = "synch-file-size-blocked";
const ICON_CLASS = "synch-file-size-blocked-icon";

export interface SynchFileSizeBlockedDecoratorState {
  listBlockedSyncFiles(): Promise<SynchBlockedSyncFile[]>;
}

export class SynchFileSizeBlockedDecorator {
  private refreshTimer: number | null = null;
  private refreshRun = 0;
  private blockedFiles: SynchBlockedSyncFile[] = [];

  constructor(
    private readonly plugin: Plugin,
    private readonly state: SynchFileSizeBlockedDecoratorState,
  ) {}

  initialize(): void {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => {
        this.decorate(this.blockedFiles);
      }),
    );
    this.plugin.register(() => {
      if (this.refreshTimer) {
        window.clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
      this.blockedFiles = [];
      this.decorate([]);
    });
  }

  queueRefresh(): void {
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 100);
  }

  async refresh(): Promise<void> {
    const run = this.refreshRun + 1;
    this.refreshRun = run;

    try {
      const blockedFiles = await this.state.listBlockedSyncFiles();
      if (run !== this.refreshRun) {
        return;
      }

      this.blockedFiles = blockedFiles;
      this.decorate(blockedFiles);
    } catch {
      if (run !== this.refreshRun) {
        return;
      }

      this.blockedFiles = [];
      this.decorate([]);
    }
  }

  private decorate(blockedFiles: SynchBlockedSyncFile[]): void {
    const blockedByPath = new Map(blockedFiles.map((file) => [file.path, file]));
    for (const leaf of this.plugin.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)) {
      decorateFileExplorerElement(leaf.view.containerEl, blockedByPath);
    }
  }
}

export function decorateFileExplorerElement(
  root: HTMLElement,
  blockedByPath: ReadonlyMap<string, SynchBlockedSyncFile>,
): void {
  for (const icon of queryHtmlElements(root, `.${ICON_CLASS}`)) {
    icon.remove();
  }
  for (const titleEl of queryHtmlElements(root, `.${BLOCKED_CLASS}`)) {
    titleEl.classList.remove(BLOCKED_CLASS);
  }

  for (const titleEl of queryHtmlElements(root, FILE_TITLE_SELECTOR)) {
    const path = titleEl.getAttribute("data-path");
    const blocked = path ? blockedByPath.get(path) : undefined;
    if (!blocked) {
      continue;
    }

    titleEl.classList.add(BLOCKED_CLASS);
    const icon = titleEl.createSpan({
      cls: ICON_CLASS,
      attr: {
        "aria-hidden": "true",
      },
    });
    setIcon(icon, "triangle-alert");
    setTooltip(icon, formatFileSizeBlockedTooltip(blocked), {
      placement: "right",
    });
  }
}

function queryHtmlElements(root: HTMLElement, selector: string): HTMLElement[] {
  const elements = root.querySelectorAll(selector) as unknown as NodeListOf<HTMLElement>;
  return Array.from(elements);
}

export function formatFileSizeBlockedTooltip(file: SynchBlockedSyncFile): string {
  if (file.reason === "incompatible_path") {
    return t("sync.incompatiblePathBlocked");
  }

  return [
    "Synch cannot sync this file because its encrypted size exceeds the file size limit.",
    `Encrypted: ${formatBytes(file.encryptedSizeBytes)}.`,
    `Limit: ${formatBytes(file.maxFileSizeBytes)}.`,
  ].join(" ");
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "unknown";
  }

  const safeBytes = Math.max(0, bytes);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = safeBytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${safeBytes} B`;
  }

  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("en-US")} ${units[unitIndex]}`;
}
