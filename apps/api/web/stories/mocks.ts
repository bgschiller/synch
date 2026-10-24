import { delay, http, HttpResponse } from "msw";
import type { JsonBodyType } from "msw";
import type { Organization } from "../src/lib/organizations";
import type { Vault } from "../src/pages/vaults";
import { translator, type Page } from "../src/lib/i18n";

export const session = {
  user: { id: "owner", name: "Alex Morgan", email: "alex@example.com" },
};
export const vaults: Vault[] = [
  {
    id: "personal",
    name: "Personal notes",
    organizationId: "studio",
    createdAt: "2026-08-01T12:00:00Z",
  },
  {
    id: "research",
    name: "Research & shared knowledge",
    organizationId: "studio",
    createdAt: "2026-09-01T12:00:00Z",
  },
];
export const organization: Organization = {
  id: "studio",
  name: "Design studio",
  role: "owner",
  sharing: { enabled: true },
  members: [
    { ...session.user, role: "owner" },
    {
      id: "member",
      name: "Jamie Lee",
      email: "jamie@example.com",
      role: "member",
    },
    {
      id: "admin",
      name: "Taylor Kim",
      email: "taylor@example.com",
      role: "admin",
    },
  ],
  invitations: [
    {
      id: "invite",
      email: "new.member@example.com",
      status: "pending",
      expiresAt: "2099-10-01T12:00:00Z",
    },
    {
      id: "expired",
      email: "expired@example.com",
      status: "pending",
      expiresAt: "2020-01-01T12:00:00Z",
    },
  ],
  vaults: [
    {
      id: "research",
      name: "Research & shared knowledge",
      shared: true,
      status: "active",
      members: [
        { userId: "owner", email: "alex@example.com", status: "active" },
        { userId: "member", email: "jamie@example.com", status: "active" },
      ],
    },
  ],
};
export const json = (path: string, body: JsonBodyType, status = 200) =>
  http.get(`*${path}`, () => HttpResponse.json(body, { status }));
export const loading = (path: string) =>
  http.get(`*${path}`, async () => {
    await delay("infinite");
  });
export const failure = (path: string) =>
  json(path, { message: "Unable to connect. Please try again." }, 503);
export const english = (page: Page) => async () => ({
  t: await translator(page, "en"),
});
export const defaults = [
  json("/api/auth/get-session", session),
  json("/api/auth/providers", { google: true, github: true }),
  json("/v1/organizations", { organizations: [organization] }),
  json("/v1/organizations/studio", organization),
  json("/v1/vaults", { vaults }),
  // Catch every remaining API request, including mutations, before it can
  // reach a backend. Individual stories explicitly opt into mock responses.
  http.all(/\/(?:api|v1)\//, () =>
    HttpResponse.json(
      { message: "This action is not enabled in this preview." },
      { status: 501 },
    ),
  ),
];
