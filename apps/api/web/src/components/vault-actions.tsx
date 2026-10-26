import { useEffect, useRef } from "react";
import type { Translator } from "../lib/i18n";

export function VaultActions({ name, t, disabled, onDelete, onMove }: {
  name: string;
  t: Translator<"vaults">;
  disabled: boolean;
  onDelete: () => void;
  onMove?: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) {
        menu.current.open = false;
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => {
    if (disabled && menu.current) menu.current.open = false;
  }, [disabled]);

  return (
    <details ref={menu} className="vault-actions" onKeyDown={(event) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    }}>
      <summary className="vault-actions-trigger" aria-label={t("vaultActions", { name })}
        aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
        </svg>
      </summary>
      <div className="vault-actions-panel">
        {onMove && (
          <button type="button" disabled={disabled} onClick={() => {
            if (menu.current) menu.current.open = false;
            onMove();
          }}>{t("moveToOrganization")}</button>
        )}
        <button type="button" disabled={disabled} onClick={() => {
          if (menu.current) menu.current.open = false;
          onDelete();
        }}>{t("delete")}</button>
      </div>
    </details>
  );
}
