export type Role = "owner" | "admin" | "member";
export type AccessStatus = "active" | "revoked";
export type InvitationStatus =
  | "pending"
  | "expired"
  | "canceled"
  | "rejected"
  | "accepted";
export interface OrganizationSummary {
  id: string;
  name: string;
  role: Role;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export interface Invitation {
  id: string;
  email: string;
  status: InvitationStatus;
  expiresAt: string;
}
export interface OrganizationVault {
  id: string;
  name: string;
  shared: boolean;
  status?: AccessStatus;
  members: { userId: string; email: string; status: AccessStatus }[];
}
export interface Organization extends OrganizationSummary {
  sharing: { enabled: boolean };
  billingUrl?: string | null;
  members: Member[];
  invitations: Invitation[];
  vaults: OrganizationVault[];
}
export function canManage(
  organization: { role: Role } | null | undefined,
): boolean {
  return organization?.role === "owner" || organization?.role === "admin";
}
export function organizationPath(id: string, suffix = ""): string {
  return `/v1/organizations/${encodeURIComponent(id)}${suffix}`;
}
