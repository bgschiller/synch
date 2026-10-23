import {
  ApiRequestError,
  createApiRequestError,
  stripTrailingSlash,
  type HttpClient,
} from "../http/request";

export type SharingRole = "owner" | "admin" | "member";
export interface SharingOrganizationSummary {
  id: string;
  name: string;
  role: SharingRole;
}

/** Only the collection endpoint can establish that a server predates sharing. */
export class OrganizationApiUnavailableError extends Error {
  constructor() {
    super("This server does not support organization sharing.");
    this.name = "OrganizationApiUnavailableError";
  }
}
export interface SharingVault {
  id: string;
  name: string;
  shared: boolean;
  personal: boolean;
  canManage: boolean;
  status: "active" | "pending_key" | "revoked" | null;
  members: {
    userId: string;
    name: string;
    email: string;
    canManage: boolean;
    status: string;
  }[];
}
export interface SharingOrganization {
  id: string;
  name: string;
  role: SharingRole;
  sharing: { enabled: boolean; memberLimit: number };
  vaults: SharingVault[];
}

/** Captures one authenticated account and server for organization listing. */
export class SharingClient {
  readonly apiBaseUrl: string;
  constructor(
    private readonly http: HttpClient,
    apiBaseUrl: string,
    private readonly token: string,
  ) {
    this.apiBaseUrl = stripTrailingSlash(apiBaseUrl);
  }
  async organizationSummaries(): Promise<SharingOrganizationSummary[]> {
    try {
      return (await this.request<{ organizations: SharingOrganizationSummary[] }>(
        "/v1/organizations",
      )).organizations;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        throw new OrganizationApiUnavailableError();
      }
      throw error;
    }
  }

  async organizations(): Promise<SharingOrganization[]> {
    const organizations = await this.organizationSummaries();
    return Promise.all(
      organizations.map((org) =>
        this.request<SharingOrganization>(
          `/v1/organizations/${encodeURIComponent(org.id)}`,
        ),
      ),
    );
  }
  private async request<T>(path: string): Promise<T> {
    const response = await this.http.request({
      url: `${this.apiBaseUrl}${path}`,
      method: "GET",
      headers: {
        authorization: `Bearer ${this.token}`,
      },
    });
    if (response.status < 200 || response.status >= 300)
      throw createApiRequestError(response, "Sharing request failed");
    return response.json as T;
  }
}
