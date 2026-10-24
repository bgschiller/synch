import { ManagementHeader } from "../components/management-header";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { Brand, BusyButton, LoadingSkeleton, Field, Status, type StatusValue } from "../components/common";
import { errorMessage, getSession, request, type User } from "../lib/api";
import { localUrl, signIn } from "../lib/navigation";
import {
  canManage,
  organizationPath,
  type Organization,
  type OrganizationSummary,
  type Role,
} from "../lib/organizations";
import type { PageProps, Translator } from "../lib/i18n";

type Action = () => Promise<unknown>;
interface ManagementProps {
  organization: Organization;
  busy: boolean;
  pendingAction: string;
  feedbackFor: (key: string) => ReactNode;
  t: Translator<"organizations">;
  perform: (action: Action, key: string) => Promise<void>;
  api: <T = unknown>(
    suffix: string,
    method: string,
    body?: unknown,
  ) => Promise<T>;
}
export function OrganizationsPage({ t, locale }: PageProps<"organizations">) {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(true);
  const lock = useRef(false);
  const [pendingAction, setPendingAction] = useState("");
  const [statusAction, setStatusAction] = useState("");
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<StatusValue>({ message: "" });

  function applyOrganization(detail: Organization) {
    if (!canManage(detail)) {
      setOrganization(null);
      location.replace(localUrl("/vaults", locale));
      return;
    }
    setOrganization(detail);
    setOrganizations((items) =>
      items.map((item) =>
        item.id === detail.id ? { ...item, name: detail.name } : item,
      ),
    );
    const url = new URL(location.href);
    url.searchParams.set("organizationId", detail.id);
    history.replaceState(null, "", url);
  }
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setStatus({ message: "" });
    async function initialize() {
      try {
        const session = await getSession(t("failed"), controller.signal);
        if (controller.signal.aborted) return;
        if (!session?.user) {
          signIn(locale);
          return;
        }
        setUser(session.user);
        const result = await request<{ organizations: OrganizationSummary[] }>(
          "/v1/organizations",
          { fallback: t("failed"), signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const visible = result.organizations.filter(canManage);
        if (!visible.length) {
          location.replace(localUrl("/vaults", locale));
          return;
        }
        setOrganizations(visible);
        const requested = new URLSearchParams(location.search).get(
          "organizationId",
        );
        const id =
          visible.find((item) => item.id === requested)?.id ?? visible[0].id;
        setSelectedId(id);
        const detail = await request<Organization>(organizationPath(id), {
          fallback: t("failed"),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          applyOrganization(detail);
          setStatus({ message: "" });
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setStatus({
            message: errorMessage(error, t("failed")),
            tone: "error",
          });
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void initialize();
    return () => controller.abort();
  }, [t, locale, retry]);

  async function perform(action: Action, key: string, id = selectedId) {
    if (lock.current || busy) return;
    lock.current = true;
    setBusy(true);
    setPendingAction(key);
    if (key !== "refresh") setStatusAction(key);
    const isRead = key === "switch" || key === "refresh";
    let committed = false;
    setStatus({ message: isRead ? "" : t("working") });
    try {
      const message = await action();
      committed = !isRead;
      const detail = await request<Organization>(organizationPath(id), {
        fallback: t("failed"),
      });
      applyOrganization(detail);
      setRefreshRequired(false);
      setStatus({
        message: isRead ? "" : typeof message === "string" ? message : t("saved"),
        tone: "success",
      });
    } catch (error) {
      if (key === "switch") setSelectedId(organization?.id ?? "");
      setRefreshRequired(committed || (isRead && refreshRequired));
      setStatus({
        message: committed
          ? t("savedRefreshFailed")
          : errorMessage(error, t("failed")),
        tone: "error",
      });
    } finally {
      setPendingAction("");
      lock.current = false;
      setBusy(false);
    }
  }
  function api<T = unknown>(suffix: string, method: string, body?: unknown) {
    return request<T>(organizationPath(selectedId, suffix), {
      method,
      body,
      fallback: t("failed"),
    });
  }
  const mutationBlocked = busy || refreshRequired;
  function feedbackFor(key: string) {
    if (statusAction !== key && !statusAction.startsWith(`${key}:`)) return null;
    if (!status.message && !refreshRequired) return null;
    return (
      <div className="action-feedback">
        <Status {...status} id="action-status" className="status--bar" />
        {refreshRequired && (
          <BusyButton
            type="button"
            className="btn btn--secondary btn--compact"
            busy={pendingAction === "refresh"}
            disabled={busy}
            onClick={() => void perform(async () => {}, "refresh")}
          >
            {t("refresh")}
          </BusyButton>
        )}
      </div>
    );
  }
  const props: ManagementProps | null = organization
    ? {
        organization,
        busy: mutationBlocked,
        pendingAction,
        feedbackFor,
        t,
        perform,
        api,
      }
    : null;
  let billingUrl = organization?.billingUrl;
  if (billingUrl) {
    const url = new URL(billingUrl);
    if (locale !== "en") url.pathname = `/${locale}/billing`;
    billingUrl = url.toString();
  }
  return (
    <main className="page page--wide management-page organization-page">
      <div className="topbar management-topbar">
        <Brand />
        <a
          className="management-link"
          id="vaults-link"
          href={localUrl(
            "/vaults",
            locale,
            selectedId ? { organizationId: selectedId } : {},
          )}
        >
          {t("vaults")}
        </a>
      </div>
      <ManagementHeader
        id="organization-header"
        title={(pendingAction === "switch"
          ? organizations.find((item) => item.id === selectedId)?.name
          : organization?.name) ?? t("title")}
      />
      {organizations.length > 1 && (
        <div id="organization-toolbar" className="org-toolbar">
          <label htmlFor="organization" className="label">
            {t("organization")}
          </label>
          <select
            id="organization"
            className="input"
            value={selectedId}
            disabled={busy}
            onChange={(event) => {
              const id = event.target.value;
              setSelectedId(id);
              setInviteUrl("");
              void perform(async () => {}, "switch", id);
            }}
          >
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {["", "switch", "leave"].includes(statusAction) && feedbackFor(statusAction)}
      {!organization && !busy && (
        <BusyButton type="button" className="btn btn--secondary retry-button" onClick={() => setRetry((value) => value + 1)}>
          {t("refresh")}
        </BusyButton>
      )}
      <div id="detail" className="org-detail" aria-busy={busy}>
        {busy && (!organization || pendingAction === "switch") && <LoadingSkeleton />}
        {organization && props && pendingAction !== "switch" && (
          <>
            {!organization.sharing.enabled && (
              <SharingNotice organization={organization} billingUrl={billingUrl} t={t} />
            )}
            <section className="org-panel org-summary">
              {organization.sharing.enabled && billingUrl && (
                <a href={billingUrl} className="org-billing">{t("billing")}</a>
              )}
              <div className="org-settings">
                <form
                  className="org-inline"
                  key={`${organization.id}:${organization.name}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const name = new FormData(event.currentTarget).get("name");
                    void perform(() => api("", "PATCH", { name }), "rename");
                  }}
                >
                  <Field label={t("name")}>
                    <input
                      className="input"
                      name="name"
                      defaultValue={organization.name}
                      maxLength={100}
                      required
                      disabled={mutationBlocked}
                    />
                  </Field>
                  <BusyButton
                    busy={pendingAction === "rename"}
                    type="submit"
                    className="btn btn--secondary btn--compact"
                    disabled={mutationBlocked}
                  >
                    {t("rename")}
                  </BusyButton>
                </form>
                {feedbackFor("rename")}
              </div>
            </section>
            <Members {...props} />
            <Invitations
              key={organization.id}
              {...props}
              onInvite={setInviteUrl}
              inviteUrl={inviteUrl}
            />
            <section className="org-vaults">
              <div className="org-panel-heading">
                <h2 className="org-section-title">{t("vaults")}</h2>
              </div>
              {organization.vaults.map((vault) => (
                <section key={vault.id} className="org-panel org-vault">
                  <div className="org-vault-header">
                    <h3 className="org-heading">{vault.name}</h3>
                    {vault.shared && !organization.sharing.enabled && (
                      <span className="org-sync-paused">{t("syncPaused")}</span>
                    )}
                  </div>
                  <div className="org-rows">
                    {vault.members.map((member) => (
                      <div
                        key={member.userId ?? member.email}
                        className="org-row"
                      >
                        <div className="org-person">
                          {member.email}
                        </div>
                        <span className={`access-status access-status--${member.status}`}>
                          {t(member.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {!organization.vaults.length && (
                <div className="management-empty">
                  <p>{t("noVaults")}</p>
                </div>
              )}
            </section>
            {organization.role !== "owner" && user && (
              <ActionButton
                danger
                pending={pendingAction === "leave"}
                busy={mutationBlocked}
                onClick={() => {
                  if (!confirm(t("removeConfirm"))) return;
                  void perform(async () => {
                    await api(
                      `/members/${encodeURIComponent(user.id)}`,
                      "DELETE",
                    );
                    setOrganization(null);
                    location.assign(localUrl("/organizations", locale));
                  }, "leave");
                }}
              >
                {t("leave")}
              </ActionButton>
            )}
          </>
        )}
      </div>
    </main>
  );
}
function SharingNotice({ organization, billingUrl, t }: {
  organization: Organization;
  billingUrl?: string | null;
  t: Translator<"organizations">;
}) {
  const paused = organization.vaults.some((vault) => vault.shared);
  return (
    <section className={`org-sharing-notice${paused ? " org-sharing-notice--paused" : ""}`} aria-labelledby="sharing-notice-title">
      <div className="org-sharing-copy">
        <h2 id="sharing-notice-title">{t(paused ? "sharingPausedTitle" : "sharingUpgradeTitle")}</h2>
        <p>{t(paused ? "sharingPausedBody" : "sharingUpgradeBody")}</p>
        {!billingUrl && <p>{t("sharingContactOwner")}</p>}
      </div>
      {billingUrl && <a className="btn btn--primary btn--compact" href={billingUrl}>{t(paused ? "restoreSharing" : "startPlus")}</a>}
    </section>
  );
}
function ActionButton({
  children,
  danger,
  pending = false,
  busy,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  pending?: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <BusyButton
      busy={pending}
      type="button"
      disabled={busy}
      className={`btn btn--compact btn--${danger ? "danger" : "secondary"}`}
      onClick={onClick}
    >
      {children}
    </BusyButton>
  );
}
function Members({ organization, busy, pendingAction, feedbackFor, t, perform, api }: ManagementProps) {
  return (
    <section className="org-panel org-members">
      <div className="org-panel-heading">
        <h2 className="org-heading">{t("members")}</h2>
      </div>
      <div className="org-rows">
        {organization.members.map((member) => (
          <div key={member.id} className="org-row">
            <div className="org-person">
              <div className="org-person-info">
                <span className="org-person-name">{member.name}</span>
                <span className="vault-meta">{member.email}</span>
              </div>
            </div>
            <div className="org-member-actions" aria-busy={pendingAction === `role:${member.id}`}>
              {pendingAction === `role:${member.id}` && <span className="loading-spinner" aria-hidden="true" />}
              {member.role === "owner" || organization.role !== "owner" ? (
                <span className="org-role">{t(member.role)}</span>
              ) : (
                <select
                  aria-label={t("role")}
                  className="input"
                  disabled={busy}
                  value={member.role}
                  onChange={(event) => {
                    const role = event.target.value;
                    void perform(() =>
                      api(`/members/${encodeURIComponent(member.id)}`, "PATCH", {
                        role,
                      }),
                      `role:${member.id}`,
                    );
                  }}
                >
                  {(["member", "admin"] as const).map((role) => (
                    <option key={role} value={role}>
                      {t(role)}
                    </option>
                  ))}
              </select>
            )}
            {member.role !== "owner" &&
              (organization.role === "owner" || member.role === "member") && (
                <ActionButton
                  busy={busy}
                  pending={pendingAction === `remove:${member.id}`}
                  danger
                  onClick={() => {
                    if (!confirm(t("removeConfirm"))) return;
                    void perform(async () => {
                      const result = await api<{ pending?: boolean }>(
                        `/members/${encodeURIComponent(member.id)}`,
                        "DELETE",
                      );
                      return t(result.pending ? "pendingRefresh" : "saved");
                    }, `remove:${member.id}`);
                  }}
                >
                  {t("remove")}
                </ActionButton>
              )}
          </div>
        </div>
      ))}
      </div>
      {feedbackFor("role")}
      {feedbackFor("remove")}
    </section>
  );
}
function Invitations({
  organization,
  busy,
  pendingAction,
  feedbackFor,
  t,
  perform,
  api,
  onInvite,
  inviteUrl,
}: ManagementProps & { onInvite: (url: string) => void; inviteUrl: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const pending = organization.invitations.filter(
    (invitation) => invitation.status === "pending",
  );
  async function send(suffix: string, body?: unknown) {
    const result = await api<{ url: string; emailSent: boolean }>(
      suffix,
      "POST",
      body,
    );
    onInvite(result.url);
    setEmail("");
    return t(result.emailSent ? "sent" : "linkReady");
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform(() => send("/invitations", { email, role }), "invite");
  }
  return (
    <section className="org-panel org-invitations">
      <div className="org-panel-heading">
        <h2 className="org-heading">{t("invitations")}</h2>
      </div>
      {organization.sharing.enabled && (
        <div className="org-invite-form">
          <form className="org-form" onSubmit={submit}>
            <Field label={t("email")}>
              <input
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
                className="input"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label={t("organizationRole")}>
              <select
                className="input"
                value={role}
                disabled={busy}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                <option value="member">{t("member")}</option>
                {organization.role === "owner" && (
                  <option value="admin">{t("admin")}</option>
                )}
              </select>
            </Field>
            <BusyButton busy={pendingAction === "invite"} type="submit" className="btn btn--primary" disabled={busy}>
              {t("invite")}
            </BusyButton>
          </form>
        </div>
      )}
      {feedbackFor("invite")}
      {inviteUrl && (
        <div id="invite-result" className="invite-result">
          <p>{t("copyLink")}</p>
          <input
            className="input"
            aria-label={t("inviteLink")}
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      <div className="org-rows">
        {pending.map((invitation) => {
          const expired = new Date(invitation.expiresAt).getTime() <= Date.now();
          return (
            <div key={invitation.id} className="org-row">
              <span className="org-person">
                {invitation.email}
                <span className={`access-status ${expired ? "access-status--expired" : "access-status--pending"}`}>
                  {t(expired ? "expired" : "pending")}
                </span>
              </span>
              <div className="org-member-actions">
                {!expired && organization.sharing.enabled && (
                  <ActionButton
                    pending={pendingAction === `resend:${invitation.id}`}
                    busy={busy}
                    onClick={() =>
                      void perform(() =>
                        send(
                          `/invitations/${encodeURIComponent(invitation.id)}/resend`,
                        ),
                        `resend:${invitation.id}`,
                      )
                    }
                  >
                    {t("resend")}
                  </ActionButton>
                )}
                <ActionButton
                  pending={pendingAction === `cancel:${invitation.id}`}
                  busy={busy}
                  onClick={() =>
                    void perform(() =>
                      api(
                        `/invitations/${encodeURIComponent(invitation.id)}/cancel`,
                        "POST",
                      ),
                      `cancel:${invitation.id}`,
                    )
                  }
                >
                  {t("cancel")}
                </ActionButton>
              </div>
            </div>
          );
        })}
      </div>
      {feedbackFor("resend")}
      {feedbackFor("cancel")}
    </section>
  );
}
