import type { SyncTokenResponse } from "@synch/sync-client/remote";
import { testEmail } from "./server";

export async function signUp(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST", headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ email: testEmail, password: "sync e2e account password", name: "Sync E2E" }),
  });
  if (!response.ok) throw new Error(`Signup: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Signup did not issue a session");
  return cookie;
}

export async function createVault(baseUrl: string, cookie: string) {
  const headers = { "content-type": "application/json", origin: baseUrl, cookie };
  const response = await fetch(`${baseUrl}/v1/vaults`, {
    method: "POST", headers,
    body: JSON.stringify({ name: crypto.randomUUID() }),
  });
  if (!response.ok) throw new Error(`Create vault: ${response.status} ${await response.text()}`);
  const { vault } = await response.json() as { vault: { id: string } };
  return attachVault(baseUrl, cookie, vault.id);
}

/** Reattach a local test client to an already provisioned vault. */
export function attachVault(baseUrl: string, cookie: string, vaultId: string) {
  const headers = { "content-type": "application/json", origin: baseUrl, cookie };
  // Vaults are no longer key-wrapped; access follows organization membership.
  const key = new Uint8Array(0);
  return {
    id: vaultId, key,
    async unlock() {
      return key;
    },
    async token(localVaultId: string): Promise<SyncTokenResponse> {
      const response = await fetch(`${baseUrl}/v1/sync/token`, {
        method: "POST", headers, body: JSON.stringify({ vaultId, localVaultId }),
      });
      if (!response.ok) throw new Error(`Token: ${response.status} ${await response.text()}`);
      return response.json() as Promise<SyncTokenResponse>;
    },
  };
}
export type TestVault = Awaited<ReturnType<typeof createVault>>;
