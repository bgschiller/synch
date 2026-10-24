import { useEffect, useState } from "react";
import { Brand, Status, type StatusValue } from "../components/common";
import {
  ApiError,
  errorMessage,
  getSession,
  request,
  signOut,
  type User,
} from "../lib/api";
import { localUrl, signIn } from "../lib/navigation";
import type { InvitationStatus, Role } from "../lib/organizations";
import type { PageProps } from "../lib/i18n";
interface InvitationDetail {
  organizationId: string;
  organizationName: string;
  role: Role;
  status: InvitationStatus;
  vaults: { vaultId: string; name: string }[];
}

export function InvitationsPage({ t, locale }: PageProps<"invitations">) {
  const [id] = useState(() =>
    new URLSearchParams(location.search).get("invitationId"),
  );
  const [user, setUser] = useState<User | null>(null);
  const [invitation, setInvitation] = useState<InvitationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusValue>({ message: "…" });
  useEffect(() => {
    const controller = new AbortController();
    async function initialize() {
      try {
        if (!id) throw new Error(t("missing"));
        const session = await getSession(t("failed"), controller.signal);
        if (controller.signal.aborted) return;
        setUser(session?.user ?? null);
        const detail = await request<InvitationDetail>(
          `/v1/invitations/${encodeURIComponent(id)}`,
          { fallback: t("failed"), signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setInvitation(detail);
          setStatus({ message: t(detail.status) });
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setStatus({
            message:
              error instanceof ApiError && error.status === 403
                ? t("wrongAccount")
                : errorMessage(error, t("failed")),
            tone: "error",
          });
      }
    }
    void initialize();
    return () => controller.abort();
  }, [id, t]);
  async function decide(action: "accept" | "reject") {
    if (busy || !id || !invitation) return;
    setBusy(true);
    try {
      const result = await request<{ organizationId: string }>(
        `/v1/invitations/${encodeURIComponent(id)}/${action}`,
        { method: "POST", fallback: t("failed") },
      );
      setInvitation({
        ...invitation,
        organizationId: result.organizationId ?? invitation.organizationId,
        status: action === "accept" ? "accepted" : "rejected",
      });
      setStatus({ message: t(action === "accept" ? "accepted" : "rejected") });
    } catch (error) {
      setStatus({ message: errorMessage(error, t("failed")), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  async function switchAccount() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut(t("failed"));
      setInvitation(null);
      setUser(null);
      signIn(locale);
    } catch (error) {
      setStatus({ message: errorMessage(error, t("failed")), tone: "error" });
      setBusy(false);
    }
  }
  return (
    <main className="page page--wide">
      <div className="topbar organization-topbar">
        <Brand />
        <span id="user" className="vault-meta">
          {user?.email}
        </span>
        {user && (
          <button
            type="button"
            className="signout-button"
            disabled={busy}
            onClick={() => void switchAccount()}
          >
            {t("switchAccount")}
          </button>
        )}
      </div>
      <header className="vaults-header">
        <div>
          <h1 className="page-title">{t("title")}</h1>
        </div>
      </header>
      <Status {...status} className="status--bar" />
      <div id="detail" className="org-detail">
        {invitation && (
          <>
            <h2>{invitation.organizationName}</h2>
            <p>
              {t("organizationRole")}: {t(invitation.role)}
            </p>
            <ul>
              {invitation.vaults.map((vault) => (
                <li key={vault.vaultId}>{vault.name}</li>
              ))}
            </ul>
            {invitation.status === "pending" && (
              <div className="org-inline">
                {(["accept", "reject"] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={`btn btn--${action === "accept" ? "primary" : "secondary"}`}
                    disabled={busy}
                    onClick={() => void decide(action)}
                  >
                    {t(action)}
                  </button>
                ))}
              </div>
            )}
            {invitation.status === "accepted" && (
              <a
                href={localUrl("/organizations", locale, {
                  organizationId: invitation.organizationId,
                })}
              >
                {t("organizations")}
              </a>
            )}
          </>
        )}
      </div>
    </main>
  );
}
