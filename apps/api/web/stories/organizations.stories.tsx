import { delay, http, HttpResponse } from "msw";
import { userEvent, within, expect } from "storybook/test";
import { translator } from "../src/lib/i18n";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrganizationsPage } from "../src/pages/organizations";
import { english, json, loading, failure, organization } from "./mocks";

const meta = {
  title: "Pages/Organizations",
  loaders: [english("organizations")],
  render: (_, { loaded }) => <OrganizationsPage t={loaded.t} locale="en" />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Owner: Story = {};
export const Admin: Story = {
  parameters: {
    msw: {
      handlers: [
        json("/v1/organizations/studio", { ...organization, role: "admin" }),
      ],
    },
  },
};
export const Loading: Story = {
  parameters: { msw: { handlers: [loading("/v1/organizations")] } },
};
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        json("/v1/organizations/studio", {
          ...organization,
          members: organization.members.slice(0, 1),
          invitations: [],
          vaults: [],
        }),
      ],
    },
  },
};
export const Error: Story = {
  parameters: { msw: { handlers: [failure("/v1/organizations")] } },
};
export const SharingSuspended: Story = {
  parameters: {
    msw: {
      handlers: [
        json("/v1/organizations/studio", {
          ...organization,
          sharing: { enabled: false },
        }),
      ],
    },
  },
};

export const SharingUnavailable: Story = {
  parameters: { msw: { handlers: [json("/v1/organizations/studio", {
    ...organization,
    sharing: { enabled: false },
    billingUrl: "https://synch.run/billing",
    invitations: [],
    vaults: [],
  })] } },
};
export const AccessStates: Story = {
  parameters: { msw: { handlers: [json("/v1/organizations/studio", {
    ...organization,
    vaults: [
      organization.vaults[0],
      { id: "revoked", name: "Archived project", shared: true, status: "revoked", members: [
        { userId: "member", email: "jamie@example.com", status: "revoked" },
      ] },
      { id: "private", name: "Private notes", shared: false, members: [] },
    ],
  })] } },
};
export const MultipleOrganizations: Story = {
  parameters: { msw: { handlers: [
    json("/v1/organizations", { organizations: [organization, { ...organization, id: "personal", name: "Personal workspace" }] }),
    json("/v1/organizations/personal", { ...organization, id: "personal", name: "Personal workspace", members: organization.members.slice(0, 1), invitations: [], vaults: [] }),
  ] } },
};
export const LongNames: Story = {
  parameters: { msw: { handlers: [json("/v1/organizations/studio", {
    ...organization,
    name: "International research and shared knowledge organization",
    members: organization.members.map(member => ({ ...member, name: `${member.name} — Research and development`, email: `${member.id}.international-research-department@example.com` })),
    invitations: organization.invitations.map(invite => ({ ...invite, email: `international-research-department.${invite.email}` })),
  })] } },
};
export const Mobile: Story = {
  ...LongNames,
  globals: { viewport: { value: "mobile", isRotated: false } },
};

const submitInvitation: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.type(await canvas.findByLabelText("Email address"), "new@example.com");
  await userEvent.click(canvas.getByRole("button", { name: "Invite member" }));
};
export const InvitationPending: Story = {
  parameters: { msw: { handlers: [http.post("*/v1/organizations/studio/invitations", async () => { await delay("infinite"); })] } },
  play: submitInvitation,
};
export const InvitationError: Story = {
  parameters: { msw: { handlers: [http.post("*/v1/organizations/studio/invitations", () => HttpResponse.json({ message: "Unable to send the invitation. Please try again." }, { status: 503 }))] } },
  play: submitInvitation,
};
export const InvitationLink: Story = {
  parameters: { msw: { handlers: [http.post("*/v1/organizations/studio/invitations", () => HttpResponse.json({ url: "https://synch.run/invitations?invitationId=storybook-preview", emailSent: false }))] } },
  play: async context => {
    await submitInvitation(context);
    await expect(within(context.canvasElement).findByLabelText("Invitation link")).resolves.toBeVisible();
  },
};
export const Korean: Story = {
  parameters: { locale: "ko" },
  loaders: [async () => ({ t: await translator("organizations", "ko") })],
  render: (_, { loaded }) => <OrganizationsPage t={loaded.t} locale="ko" />,
};

export const RenamePending: Story = {
  parameters: { msw: { handlers: [http.patch("*/v1/organizations/studio", async () => { await delay("infinite"); })] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(await canvas.findByLabelText("Organization name"));
    await userEvent.type(canvas.getByLabelText("Organization name"), "Renamed studio");
    await userEvent.click(canvas.getByRole("button", { name: "Rename" }));
  },
};
export const RenameError: Story = {
  parameters: { msw: { handlers: [http.patch("*/v1/organizations/studio", () => HttpResponse.json({ message: "Unable to rename the organization. Please try again." }, { status: 503 }))] } },
  play: RenamePending.play,
};
