import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "./auth";
import { DevicePage } from "./device";
import { InvitationsPage } from "./invitations";
import { OrganizationsPage } from "./organizations";
import { VaultsPage } from "./vaults";
import {
  CreateVaultDialog,
  DeleteVaultDialog,
} from "../components/vault-dialogs";
import { translator } from "../lib/i18n";
import * as navigation from "../lib/navigation";
import type { Organization } from "../lib/organizations";

const session = {
  user: { id: "user-1", email: "owner@example.com", name: "Owner" },
};
const organization: Organization = {
  id: "org-1",
  name: "My organization",
  role: "owner",
  sharing: { enabled: true },
  members: [
    { ...session.user, role: "owner" },
    {
      id: "user-2",
      email: "member@example.com",
      name: "Member",
      role: "member",
    },
  ],
  invitations: [],
  vaults: [],
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

describe("authentication", () => {
  it("keeps the callback URL and disables verification resend during cooldown", async () => {
    history.replaceState(
      null,
      "",
      "/signin?return_to=%2Fdevice%3Fuser_code%3DABCD&lang=ko",
    );
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("get-session")
        ? json(null)
        : String(input).includes("sign-in/email")
          ? json(
              { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
              403,
            )
          : json({ ok: true }),
    );
    const t = await translator<"signin" | "signup">("signin", "en");
    render(<AuthPage mode="signin" t={t} locale="ko" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "account-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText("Email verification required");
    const auth = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("sign-in/email"),
    )!;
    expect(JSON.parse(String(auth[1]?.body))).toMatchObject({
      callbackURL: "http://localhost:3000/device?user_code=ABCD",
    });
    expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      (
        screen.getByRole("button", {
          name: /Resend available/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const signup = screen.getByRole("link", { name: "Sign up" });
    expect(
      new URL(signup.getAttribute("href")!).searchParams.get("return_to"),
    ).toContain("/device?user_code=ABCD");
  });
  it("shows the verification state for signup without a session token", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("providers") ? json({ google: false }) : json({ token: null }),
    );
    render(
      <AuthPage
        mode="signup"
        t={await translator<"signin" | "signup">("signup", "en")}
        locale="en"
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "New User");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "account-password");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByText("Check your email");
    expect(
      (screen.getByRole("button", { name: "Email Sent" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("device approval", () => {
  it("requires an explicit approval and exposes only the supported return URI", async () => {
    history.replaceState(
      null,
      "",
      "/device?user_code=abcd-efgh&return_uri=obsidian%3A%2F%2Fsynch-device-login",
    );
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("get-session")
        ? json(session)
        : String(input).includes("?")
          ? json({ status: "pending" })
          : json({ ok: true }),
    );
    render(<DevicePage t={await translator("device", "en")} locale="en" />);
    const approve = await screen.findByRole("button", {
      name: "Allow Obsidian sign-in",
    });
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method !== "POST"),
    ).toBe(true);
    await userEvent.click(approve);
    const link = await screen.findByRole("link", {
      name: "Return to Obsidian",
    });
    expect(link.getAttribute("href")).toBe("obsidian://synch-device-login");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/device/approve",
      expect.objectContaining({
        body: JSON.stringify({ userCode: "ABCDEFGH" }),
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Allow Obsidian sign-in" }),
    ).toBeNull();
  });
  it("returns unauthenticated device users to sign-in", async () => {
    fetchMock.mockResolvedValue(json(null));
    const redirect = vi
      .spyOn(navigation, "signIn")
      .mockImplementation(() => {});
    render(<DevicePage t={await translator("device", "en")} locale="ko" />);
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("ko"));
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("vault safety", () => {
  it("creates with only the name and prevents duplicate submits", async () => {
    let finish!: () => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = () => resolve(json({ id: "vault-1" }));
      }),
    );
    const success = vi.fn();
    const close = vi.fn();
    render(
      <CreateVaultDialog
        organizationId="org-1"
        t={await translator("vaults", "en")}
        onClose={close}
        onSuccess={success}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Vault name"), "Vault");
    await user.click(screen.getByRole("button", { name: "Create vault" }));
    expect(
      (screen.getByRole("button", { name: "Creating..." }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { cancelable: true }),
    );
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(success).toHaveBeenCalledWith("Vault"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      name: "Vault",
      organizationId: "org-1",
    });
  });
  it("requires the exact vault name and leaves the dialog usable after deletion fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ message: "Try again" }, 503))
      .mockResolvedValueOnce(json({ ok: true }));
    const success = vi.fn();
    render(
      <DeleteVaultDialog
        vault={{
          id: "vault-1",
          name: "My Vault",
          organizationId: "org-1",
          createdAt: "2026-01-01",
        }}
        t={await translator("vaults", "en")}
        onClose={() => {}}
        onSuccess={success}
      />,
    );
    const button = screen.getByRole("button", {
      name: "Delete permanently",
    }) as HTMLButtonElement;
    const input = screen.getByLabelText("Type the vault name to confirm");
    const user = userEvent.setup();
    await user.type(input, "My vault");
    expect(button.disabled).toBe(true);
    await user.clear(input);
    await user.type(input, "My Vault");
    await user.click(button);
    await screen.findByText("Try again");
    expect(button.disabled).toBe(false);
    expect(success).not.toHaveBeenCalled();
    await user.click(button);
    await waitFor(() => expect(success).toHaveBeenCalledWith("My Vault"));
  });
  it("lists all managed organizations and disables queued deletions", async () => {
    const other = { ...organization, id: "org-2", name: "Second organization", role: "admin" };
    const member = { ...organization, id: "org-3", role: "member" };
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("get-session")) return json(session);
      if (url === "/v1/organizations")
        return json({ organizations: [organization, other, member] });
      if (url.endsWith("org-2")) return json(other);
      if (url.includes("/v1/organizations/")) return json(organization);
      return json({
        vaults: [
          { id: "v3", name: "Member vault", organizationId: "org-3", createdAt: "2026-01-01" },
          {
            id: "v1",
            name: "Visible",
            organizationId: "org-1",
            createdAt: "2026-01-01",
            deletionStatus: "queued",
          },
          {
            id: "v2",
            name: "Other organization",
            organizationId: "org-2",
            createdAt: "2026-01-01",
          },
        ],
      });
    });
    render(<VaultsPage t={await translator("vaults", "en")} locale="en" />);
    await screen.findByText("Visible");
    expect(screen.getByText("Other organization")).toBeTruthy();
    expect(screen.queryByText("Member vault")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Second organization" })).getByText("Other organization")).toBeTruthy();
    const queuedActions = screen.getByLabelText("Actions for Visible");
    expect(queuedActions.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(queuedActions);
    expect(queuedActions.closest("details")?.open).toBe(false);
    const actions = screen.getByLabelText("Actions for Other organization");
    await userEvent.click(actions);
    await userEvent.keyboard("{Escape}");
    expect(actions.closest("details")?.open).toBe(false);
    expect(document.activeElement).toBe(actions);
    await userEvent.click(actions);
    await userEvent.click(within(actions.closest("details")!).getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(screen.getByRole("region", { name: "Second organization" })).getByRole("button", { name: "Create vault" }));
    const dialog = within(screen.getByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Vault name"), "New team vault");
    await userEvent.click(dialog.getByRole("button", { name: "Create vault" }));
    await waitFor(() => {
      const creation = fetchMock.mock.calls.find(([url, init]) => url === "/v1/vaults" && init?.method === "POST");
      expect(creation).toBeTruthy();
      expect(JSON.parse(String(creation![1]?.body)).organizationId).toBe("org-2");
    });
    await screen.findByRole("dialog", { name: "Connect “New team vault” in Obsidian" });
    expect(screen.getByText(/select “New team vault”/)).toBeTruthy();
  });
});

describe("organization management", () => {
  it("preserves role controls and exposes generated invitation links", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("get-session")) return json(session);
      if (url === "/v1/organizations")
        return json({ organizations: [organization] });
      if (init?.method === "POST")
        return json({
          url: "http://localhost:3000/invitations?invitationId=invite-1",
          emailSent: false,
        });
      return json(organization);
    });
    render(
      <OrganizationsPage
        t={await translator("organizations", "en")}
        locale="en"
      />,
    );
    await screen.findByRole("heading", { name: "My organization" });
    expect(screen.getAllByRole("combobox", { name: "Role" })).toHaveLength(1);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Email address"),
      "invited@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Invite member" }));
    const link = (await screen.findByLabelText(
      "Invitation link",
    )) as HTMLInputElement;
    expect(link.value).toContain("invitationId=invite-1");
    const call = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      email: "invited@example.com",
      role: "member",
    });
    const ownerRow = screen.getByText("owner@example.com").closest(".org-row")!;
    expect(within(ownerRow as HTMLElement).queryByRole("button")).toBeNull();
  });
  it("accepts invitations and points to the accepted organization", async () => {
    history.replaceState(null, "", "/invitations?invitationId=invite-1");
    fetchMock.mockImplementation(async (input, init) =>
      String(input).includes("get-session")
        ? json(session)
        : init?.method === "POST"
          ? json({ organizationId: "org-1" })
          : json({
              organizationId: "org-1",
              organizationName: "Team",
              role: "member",
              status: "pending",
              vaults: [],
            }),
    );
    render(
      <InvitationsPage t={await translator("invitations", "en")} locale="en" />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );
    await screen.findByText("Accepted");
    expect(
      screen
        .getByRole("link", { name: "Manage organization" })
        .getAttribute("href"),
    ).toContain("organizationId=org-1");
    expect(
      screen.queryByRole("button", { name: "Reject invitation" }),
    ).toBeNull();
  });
  it("allows switching accounts when an invitation is unavailable", async () => {
    history.replaceState(null, "", "/invitations?invitationId=invite-1");
    const redirect = vi
      .spyOn(navigation, "signIn")
      .mockImplementation(() => {});
    fetchMock.mockImplementation(async (input, init) =>
      String(input).includes("get-session")
        ? json(session)
        : init?.method === "POST"
          ? json({ ok: true })
          : json({ message: "Forbidden" }, 403),
    );
    render(
      <InvitationsPage t={await translator("invitations", "en")} locale="en" />,
    );
    await screen.findByText(/This invitation is unavailable for this account/);
    await userEvent.click(
      screen.getByRole("button", { name: "Switch account" }),
    );
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("en"));
  });
});

describe("management loading feedback", () => {
  function deferredResponse() {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>((done) => { resolve = done; });
    return { promise, resolve };
  }

  it("offers retry only after a vault loading error", async () => {
    const retry = deferredResponse();
    let failed = false;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("get-session")) return json(session);
      if (url === "/v1/organizations") {
        if (!failed) {
          failed = true;
          return json({ message: "Connection interrupted" }, 503);
        }
        return retry.promise;
      }
      if (url.startsWith("/v1/organizations/")) return json(organization);
      return json({ vaults: [{ id: "v1", name: "My notes", organizationId: "org-1", createdAt: "2026-01-01" }] });
    });
    render(<VaultsPage t={await translator("vaults", "en")} locale="en" />);
    await screen.findByText("Connection interrupted");
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await act(async () => retry.resolve(json({ organizations: [organization] })));
    await screen.findByText("My notes");
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("restores the selected organization after a failed switch", async () => {
    const switching = deferredResponse();
    const other = { ...organization, id: "org-2", name: "Other workspace" };
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("get-session")) return json(session);
      if (url === "/v1/organizations") return json({ organizations: [organization, other] });
      if (url.endsWith("org-2")) return switching.promise;
      return json(organization);
    });
    render(<OrganizationsPage t={await translator("organizations", "en")} locale="en" />);
    await screen.findByRole("heading", { name: "My organization" });
    await userEvent.selectOptions(screen.getByLabelText("Organization"), "org-2");
    expect(screen.queryByLabelText("Email address")).toBeNull();
    await act(async () => switching.resolve(json({ message: "Try again" }, 503)));
    await screen.findByText("Try again");
    expect((screen.getByLabelText("Organization") as HTMLSelectElement).value).toBe("org-1");
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(location.search).toContain("organizationId=org-1");
  });

  it("marks only the submitted action busy and preserves failed invitation input", async () => {
    const invitation = deferredResponse();
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes("get-session")) return json(session);
      if (String(input) === "/v1/organizations") return json({ organizations: [organization] });
      if (init?.method === "POST") return invitation.promise;
      return json(organization);
    });
    render(<OrganizationsPage t={await translator("organizations", "en")} locale="en" />);
    const email = await screen.findByLabelText("Email address");
    await userEvent.type(email, "invite@example.com");
    const invite = screen.getByRole("button", { name: "Invite member" });
    await userEvent.click(invite);
    await userEvent.click(invite);
    expect(invite.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { name: "Remove member" }).getAttribute("aria-busy")).toBe("false");
    expect(screen.getByText("member@example.com")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () => invitation.resolve(json({ message: "Invitation failed" }, 503)));
    await screen.findByText("Invitation failed");
    expect((email as HTMLInputElement).value).toBe("invite@example.com");
    expect((invite as HTMLButtonElement).disabled).toBe(false);
    expect(invite.getAttribute("aria-busy")).toBe("false");
  });
});

it("retries only the read after an invitation succeeds but refreshing fails", async () => {
  let detailRequests = 0;
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("get-session")) return json(session);
    if (url === "/v1/organizations") return json({ organizations: [organization] });
    if (init?.method === "POST") return json({ url: "http://localhost:3000/invitations?invitationId=created", emailSent: false });
    detailRequests += 1;
    return detailRequests === 2 ? json({ message: "Temporary outage" }, 503) : json(organization);
  });
  render(<OrganizationsPage t={await translator("organizations", "en")} locale="en" />);
  await userEvent.type(await screen.findByLabelText("Email address"), "new@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Invite member" }));
  const message = await screen.findByText("Changes saved, but the latest data could not be loaded. Refresh to continue.");
  expect(message.closest(".org-invitations")).toBeTruthy();
  expect(screen.getByLabelText("Invitation link").closest(".org-invitations")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Invite member" }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Invite member" }) as HTMLButtonElement).disabled).toBe(false));
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect((screen.getByLabelText("Invitation link") as HTMLInputElement).value).toContain("invitationId=created");
  expect(detailRequests).toBe(3);
});


it("shows member guidance instead of creation instructions without management access", async () => {
  fetchMock.mockImplementation(async input => String(input).includes("get-session")
    ? json(session)
    : json({ organizations: [{ ...organization, role: "member" }] }));
  render(<VaultsPage t={await translator("vaults", "en")} locale="en" />);
  await screen.findByRole("heading", { name: "No organizations to manage" });
  expect(screen.queryByText("How to start syncing")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create vault" })).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/v1/vaults"))).toBe(false);
});

it("guides first-time users into Obsidian and refreshes the list on return", async () => {
  let pluginCreatedVault = false;
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("get-session")) return json(session);
    if (url === "/v1/organizations") return json({ organizations: [organization] });
    if (url.startsWith("/v1/organizations/")) return json(organization);
    return json({ vaults: pluginCreatedVault ? [{ id: "v1", name: "From Obsidian", organizationId: "org-1", createdAt: "2026-01-01" }] : [] });
  });
  render(<VaultsPage t={await translator("vaults", "en")} locale="en" />);
  await screen.findByRole("heading", { name: "Start syncing your Obsidian vault" });
  expect(screen.getByRole("link", { name: "Get Synch for Obsidian" }).getAttribute("href")).toBe("https://community.obsidian.md/plugins/synch");
  expect(screen.getByRole("link", { name: "Already installed? Open Synch settings" }).getAttribute("href")).toBe("obsidian://synch-device-login");
  expect(screen.getByText(/sign in with owner@example.com/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create on the web instead" })).toBeNull();
  expect(screen.queryByRole("region", { name: "My organization" })).toBeNull();
  pluginCreatedVault = true;
  fireEvent.focus(window);
  await screen.findByText("From Obsidian");
  expect(screen.queryByRole("heading", { name: "Start syncing your Obsidian vault" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Connect in Obsidian" })).toBeNull();
});
