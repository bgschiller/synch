import { useState, type SubmitEvent } from "react";
import { BusyButton, Modal } from "./common";
import { ApiError, request } from "../lib/api";
import type { Translator } from "../lib/i18n";
import type { OrganizationSummary } from "../lib/organizations";
import type { Vault } from "../pages/vaults";

interface DialogProps {
  t: Translator<"vaults">;
  onClose: () => void;
  onSuccess: (name: string) => void;
}
export function CreateVaultDialog({
  t,
  organizationId,
  onClose,
  onSuccess,
}: DialogProps & { organizationId: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("nameRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/v1/vaults", {
        method: "POST",
        fallback: t("unableToCreateVault"),
        body: {
          name: trimmedName,
          organizationId,
        },
      });
      onSuccess(trimmedName);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : t("apiUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      id="create-dialog"
      title={t("createTitle")}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={(event) => { void submit(event); }}>
        <div className="dialog-body">
          <h2 className="dialog-title">{t("createTitle")}</h2>
          <p className="dialog-intro">{t("createIntro")}</p>
          <div className="dialog-fields">
            <div className="field">
              <label className="label" htmlFor="create-name">
                {t("createNameLabel")}
              </label>
              <input
                id="create-name"
                className="input"
                autoComplete="off"
                autoFocus
                value={name}
                disabled={busy}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
              />
            </div>
            {error && (
              <p id="create-error" className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <BusyButton
            busy={busy}
            id="confirm-create"
            type="submit"
            className="btn btn--primary"
            disabled={busy || !name.trim()}
          >
            {t(busy ? "creating" : "createConfirm")}
          </BusyButton>
        </div>
      </form>
    </Modal>
  );
}
export function DeleteVaultDialog({
  t,
  vault,
  onClose,
  onSuccess,
}: DialogProps & { vault: Vault }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || confirmation !== vault.name) return;
    setBusy(true);
    setError("");
    try {
      await request(`/v1/vaults/${encodeURIComponent(vault.id)}`, {
        method: "DELETE",
        fallback: t("unableToDeleteVault"),
      });
      onSuccess(vault.name);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : t("apiUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      id="delete-dialog"
      title={t("deleteTitle")}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={(event) => { void submit(event); }}>
        <div className="dialog-body">
          <h2 className="dialog-title">{t("deleteTitle")}</h2>
          <p className="dialog-intro">
            {t("deleteCopy", { name: vault.name })}
          </p>
          <div className="field">
            <label htmlFor="confirm-name" className="label">
              {t("confirmLabel")}
            </label>
            <input
              id="confirm-name"
              className="input"
              autoComplete="off"
              autoFocus
              disabled={busy}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <BusyButton
            busy={busy}
            id="confirm-delete"
            type="submit"
            className="btn btn--danger"
            disabled={busy || confirmation !== vault.name}
          >
            {t(busy ? "deleting" : "deletePermanently")}
          </BusyButton>
        </div>
      </form>
    </Modal>
  );
}
export function CreateOrganizationDialog({
  t,
  onClose,
  onCreated,
}: {
  t: Translator<"vaults">;
  onClose: () => void;
  onCreated: (organization: OrganizationSummary) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("organizationNameRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request<{ organization: OrganizationSummary }>(
        "/v1/organizations",
        {
          method: "POST",
          fallback: t("unableToCreateOrganization"),
          body: { name: trimmedName },
        },
      );
      onCreated(result.organization);
    } catch (error) {
      setError(error instanceof ApiError ? error.message : t("apiUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      id="create-organization-dialog"
      title={t("createOrganizationTitle")}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={(event) => { void submit(event); }}>
        <div className="dialog-body">
          <h2 className="dialog-title">{t("createOrganizationTitle")}</h2>
          <p className="dialog-intro">{t("createOrganizationIntro")}</p>
          <div className="dialog-fields">
            <div className="field">
              <label className="label" htmlFor="organization-name">
                {t("organizationNameLabel")}
              </label>
              <input
                id="organization-name"
                className="input"
                autoComplete="off"
                autoFocus
                value={name}
                disabled={busy}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
              />
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <BusyButton
            busy={busy}
            type="submit"
            className="btn btn--primary"
            disabled={busy || !name.trim()}
          >
            {t(busy ? "creatingOrganization" : "createOrganizationConfirm")}
          </BusyButton>
        </div>
      </form>
    </Modal>
  );
}
export function MoveVaultDialog({
  t,
  vault,
  organizations,
  onClose,
  onSuccess,
}: {
  t: Translator<"vaults">;
  vault: Vault;
  organizations: OrganizationSummary[];
  onClose: () => void;
  onSuccess: (vaultName: string, organizationName: string) => void;
}) {
  const targetOrganizations = organizations.filter(
    (organization) => organization.id !== vault.organizationId,
  );
  const [targetId, setTargetId] = useState(targetOrganizations[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !targetId) return;
    setBusy(true);
    setError("");
    try {
      await request(`/v1/vaults/${encodeURIComponent(vault.id)}/organization`, {
        method: "PATCH",
        fallback: t("unableToMoveVault"),
        body: { organizationId: targetId },
      });
      const target = targetOrganizations.find(
        (organization) => organization.id === targetId,
      );
      onSuccess(vault.name, target?.name ?? "");
    } catch (error) {
      setError(error instanceof ApiError ? error.message : t("apiUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      id="move-vault-dialog"
      title={t("moveTitle")}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={(event) => { void submit(event); }}>
        <div className="dialog-body">
          <h2 className="dialog-title">{t("moveTitle")}</h2>
          <p className="dialog-intro">{t("moveIntro", { name: vault.name })}</p>
          <div className="dialog-fields">
            <div className="field">
              <label className="label" htmlFor="move-organization">
                {t("moveOrganizationLabel")}
              </label>
              <select
                id="move-organization"
                className="input"
                value={targetId}
                disabled={busy}
                onChange={(event) => setTargetId(event.target.value)}
              >
                {targetOrganizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <BusyButton
            busy={busy}
            type="submit"
            className="btn btn--primary"
            disabled={busy || !targetId}
          >
            {t(busy ? "movingVault" : "moveConfirm")}
          </BusyButton>
        </div>
      </form>
    </Modal>
  );
}
