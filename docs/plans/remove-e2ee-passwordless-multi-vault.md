# Implementation Plan: Remove E2EE (identity crypto), passwordless vaults, lift org limit

> **Goal** (from the fork owner): keep "deploy to Cloudflare" and vault sync, but
> (1) remove all E2EE via an *identity* `SyncCryptoContext`, (2) simplify the client UX
> by removing vault passwords, and (3) allow multiple sync'd vaults per user
> (personal / work / household shared with roommates).

---

## 0. Repository state (already done)

- `origin` → `https://github.com/bgschiller/synch.git` (your fork)
- `upstream` → `https://github.com/hjinco/synch.git`
- Branch `main`, clean tree.

Fork-specific docs you should skim first:

- `AGENTS.md` (workspace overview, `pnpm` only, benchmark instructions)
- `apps/api/README.md` / `apps/www/src/pages/self-hosting.astro` (Cloudflare deploy)
- `apps/api/scripts/migrate-cloudflare-community.mjs` (D1 migration runner)

---

## 1. Architecture primer (read once)

Everything syncs through `packages/sync-client`. The engine
(`packages/sync-client/src/sync/engine/*` and `sync/runtime/*`) never touches encryption
directly — it calls five narrow functions in `packages/sync-client/src/sync/core/crypto.ts`:

- `encryptSyncMetadata(remoteVaultKey, metadata, context)` → string
- `decryptSyncMetadata(remoteVaultKey, encryptedMetadata, context)` → `SyncedEntryMetadata`
- `encryptSyncBlob(remoteVaultKey, plaintext, context)` → `Uint8Array`
- `decryptSyncBlob(remoteVaultKey, encryptedBlob, context)` → `Uint8Array`
- `encryptedSyncBlobSize(plaintextBytes)` → number

plus `createSyncCryptoContext(remoteVaultKey)` (used by a couple of files, e.g.
`pull-blob-preparer.ts`, `push-mutation-preparer.ts`, `mutation-queue.ts`).

The server (`apps/api`) treats `entries.encrypted_metadata` and R2 blobs as **opaque**
bytes — it never decrypts. So making the client crypto identity requires **zero changes**
to the server's sync-coordinator / sync-blob-transfer / durable-object paths.

The vault **key** is a `Uint8Array` threaded through a `getRemoteVaultKey: () => Uint8Array`
callback (`apps/obsidian-plugin/src/app/sync-controller.ts:60,106`,
`apps/obsidian-plugin/src/app/plugin-controller.ts:178,837`). After identity crypto it is
ignored but still needs *some* value to keep the plumbing compiling.

**Key design decision:** keep the `remoteVaultKey: Uint8Array` plumbing in Stage 1 and feed
it a constant "identity key". This avoids touching ~20 engine files. Remove the plumbing
entirely as an optional Stage 2 cleanup. The UX win (no passwords) does **not** require
removing the plumbing.

---

## 2. Task breakdown

Do these in order. Each task ends with a commit and a green test run.

### Task 1 — Identity `SyncCryptoContext` (the core)

**File:** `packages/sync-client/src/sync/core/crypto.ts`

Make the five exported functions identity (ignore `remoteVaultKey`):

```ts
export function encryptedSyncBlobSize(plaintextBytes: number): number {
  return plaintextBytes;
}

export function createSyncCryptoContext(_remoteVaultKey: Uint8Array): SyncCryptoContext {
  return new IdentitySyncCryptoContext();
}

export async function encryptSyncMetadata(
  _remoteVaultKey: Uint8Array,
  metadata: SyncedEntryMetadata,
  _context: SyncMetadataCryptoContext,
): Promise<string> {
  return serializeSyncedEntryMetadata(metadata);
}

export async function decryptSyncMetadata(
  _remoteVaultKey: Uint8Array,
  encryptedMetadata: string,
  _context: SyncMetadataCryptoContext,
): Promise<SyncedEntryMetadata> {
  return parseSyncedEntryMetadata(encryptedMetadata);
}

export async function encryptSyncBlob(
  _remoteVaultKey: Uint8Array,
  plaintext: Uint8Array,
  _context: SyncBlobCryptoContext,
): Promise<Uint8Array> {
  return plaintext;
}

export async function decryptSyncBlob(
  _remoteVaultKey: Uint8Array,
  encryptedBlob: Uint8Array,
  _context: SyncBlobCryptoContext,
): Promise<Uint8Array> {
  return encryptedBlob;
}
```

Replace `VaultSyncCryptoContext` with:

```ts
class IdentitySyncCryptoContext implements SyncCryptoContext {
  async encryptMetadata(metadata: SyncedEntryMetadata, _c: SyncMetadataCryptoContext) {
    return serializeSyncedEntryMetadata(metadata);
  }
  async decryptMetadata(encryptedMetadata: string, _c: SyncMetadataCryptoContext) {
    return parseSyncedEntryMetadata(encryptedMetadata);
  }
  async encryptBlob(plaintext: Uint8Array, _c: SyncBlobCryptoContext) {
    return plaintext;
  }
  async decryptBlob(encryptedBlob: Uint8Array, _c: SyncBlobCryptoContext) {
    return encryptedBlob;
  }
  dispose(): void {}
}
```

**What to delete** from this file: `AES_GCM_NONCE_BYTES`, `KEY_USAGE_SALT`,
`SYNC_BLOB_MAGIC`, `SYNC_BLOB_*_OFFSET`, `AES_GCM_TAG_BYTES`, `EncryptedEnvelope`,
`encryptEnvelope`, `decryptEnvelope`, `encryptAesGcm`, `decryptAesGcm`,
`deriveUsageKey`, `encodeMetadataAad`, `encodeBlobAad`, `parseBinaryBlobEnvelope`,
`parseEncryptedEnvelope`, `VaultSyncCryptoContext`. Keep `SyncCryptoContext`,
`SyncMetadataCryptoContext`, `SyncBlobCryptoContext`, `SyncCryptoError` exports (other
files import them).

**Keep** the `@synch/vault-crypto` import if `decodeBase64`/`encodeBase64`/`randomBytes`/
`toArrayBuffer` are still referenced elsewhere in the file; otherwise drop the import.

**TDD:** rewrite `packages/sync-client/src/sync/core/crypto.test.ts` first. Assert:
- `encryptSyncMetadata` returns exactly `serializeSyncedEntryMetadata(metadata)` (a JSON string).
- `decryptSyncMetadata` round-trips it back to the same object.
- `encryptSyncBlob` returns the same bytes by reference (or equal content); `decryptSyncBlob` round-trips.
- `encryptedSyncBlobSize(10) === 10`.
- `createSyncCryptoContext(anything)` still implements the interface (dispose is a no-op).

**Verify:** `pnpm -C packages/sync-client test --run`. The engine tests in
`packages/sync-client/src/sync/engine/__tests__/*` use the helpers with a `TEST_VAULT_KEY`
and should keep passing unchanged — this is your regression net proving the engine is
unaffected.

**Commit:** `sync-client: identity SyncCryptoContext`.

---

### Task 2 — Passwordless vault creation (client types + manager)

**Files:** `packages/sync-client/src/remote-vault/types.ts`,
`packages/sync-client/src/remote-vault/manager.ts`,
`packages/sync-client/src/remote-vault/client.ts`.

`types.ts`:
- `CreateRemoteVaultInput` → `{ organizationId?: string; name: string }` (drop `password`, `confirmPassword`).
- `BootstrapRemoteVaultInput` → `{ vaultId: string }` (drop `password`).
- Leave `RemoteVaultSession.remoteVaultKey` and `StoredRemoteVaultKeySecret` for now (Stage 2 removes them).

`manager.ts`:
- Add `const IDENTITY_REMOTE_VAULT_KEY = new Uint8Array(32);` at module top (documented: ignored by identity crypto).
- Remove the `@synch/vault-crypto` import (`createPasswordWrappedRemoteVaultKey`, `unwrapRemoteVaultKeyWithPassword`, `validateVaultPassword`, `VaultPasswordValidation`).
- `RemoteVaultInputFailure` → keep only `{ kind: "name_required" }`.
- `validateCreateInput` → only the name check.
- `createRemoteVault(input)`:
  - drop `createPasswordWrappedRemoteVaultKey`.
  - call `remoteVaultClient.createRemoteVault(..., { name: input.name.trim(), ...(input.organizationId ? { organizationId: input.organizationId } : {}) })`.
  - `loadBootstrapRemoteVaultSession(bootstrap)` (no password).
- `bootstrapRemoteVault(input, beforeActivate)` → drop `input.password`; `loadBootstrapRemoteVaultSession(bootstrap, beforeActivate)`.
- `loadBootstrapRemoteVaultSession(bootstrap, beforeActivate?)` → delete `findPasswordWrapper`/`unwrapRemoteVaultKey`; set `remoteVaultKey: IDENTITY_REMOTE_VAULT_KEY`; keep the `beforeActivate` revalidation; stop calling `saveStoredRemoteVaultKeySecret`.
- `restoreStoredSessionIfNeeded()` → restore when `getStoredRemoteVaultId()` exists and authenticated; set `remoteVaultKey: IDENTITY_REMOTE_VAULT_KEY`; drop the `getStoredRemoteVaultKeySecret()` check.
- `getRemoteVaultStatus()` / `hasConnectedRemoteVault()` → drop the `getStoredRemoteVaultKeySecret()` checks.
- Delete `unwrapRemoteVaultKey`, `isCryptoOperationError`, `findPasswordWrapper`.

`client.ts`:
- `createRemoteVault(input: { name: string; organizationId?: string })` — remove `initialWrapper` from the request body type.

**Keep** the `RemoteVaultManagerDeps` fields `getStoredRemoteVaultKeySecret` /
`saveStoredRemoteVaultKeySecret` in the interface for now (harmless); they become unused
and are removed in Stage 2. Mark them with a `// TODO(identity): remove in Stage 2` comment.

**TDD:** update/extend any manager tests under `packages/sync-client/src/remote-vault/`:
- creating a vault no longer requires a password; input `{ name }` succeeds.
- an empty name still throws `RemoteVaultInputError({ kind: "name_required" })`.

**Verify:** `pnpm -C packages/sync-client test --run` and `pnpm -C packages/sync-client typecheck`.

**Commit:** `sync-client: passwordless remote vault create/connect`.

---

### Task 3 — Server: drop `initialWrapper` from vault creation

**Files:** `apps/api/src/vault/adapters/inbound/http/routes.ts`,
`apps/api/src/vault/application/ports/inbound/vault-service.ts`,
`apps/api/src/vault/application/services/vault-service.ts`,
`apps/api/src/vault/application/ports/outbound/vault-key-store.ts`,
`apps/api/src/vault/adapters/outbound/drizzle-vault-store.ts`.

1. `routes.ts` POST `/v1/vaults`: change the `zValidator` body to
   `z.object({ organizationId: z.string().min(1).optional(), name: z.string().trim().min(1) })`
   and call `createVault(user.id, body.name, body.organizationId)`.
2. `vault-service.ts` (the `VaultService` **interface**) and
   `services/vault-service.ts` (the class): change
   `createVault(userId, name, selectedOrganizationId?)` — drop `initialWrapper`.
3. `vault-key-store.ts` interface: `createVaultForUser(userId, organizationId, name, maxVaults?)`.
4. `drizzle-vault-store.ts` `createVaultForUser`:
   - In the `vault` INSERT `SELECT ...`, replace `${initialWrapper.envelope.keyVersion}` with a literal `1` for `active_key_version`.
   - **Remove** the second batch item (`insert(schema.vaultKeyWrapper).select(...)`).
   - Keep the `vaultMembership` insert (it establishes the creator's access).
5. Optional dead-code cleanup (same PR is fine): remove the
   `PUT /v1/vaults/:vaultId/password-wrapper` route, `VaultService.replacePasswordWrapper`,
   and `VaultKeyStore.upsertPasswordWrapperForUser`.

**Leave as-is** (no migration needed): `vault_key_wrapper` table, `GET /v1/vaults/:vaultId/bootstrap`
route, and `readVaultBootstrapForUser` in `drizzle-vault-store.ts`. Bootstrap now returns
`wrappers: []`, which the client ignores after Task 2.

**TDD:** update `apps/api/src/vault/application/services/vault-service.test.ts` (and any
route tests) — creating a vault without a wrapper succeeds and no `vault_key_wrapper` row
is written.

**Verify:** `pnpm -C apps/api test:unit` and `pnpm -C apps/api typecheck`.

**Commit:** `api: passwordless vault creation`.

---

### Task 4 — Plugin UX: remove password fields from connect/create modal

**Files:** `apps/obsidian-plugin/src/ui/remote-vault/connect-vault-flow.ts`,
`apps/obsidian-plugin/src/ui/remote-vault/connect-vault-modal.ts`,
`apps/obsidian-plugin/src/ui/remote-vault/remote-vault-controller.ts`,
`apps/obsidian-plugin/src/ui/remote-vault/remote-vault-modals.ts`.

`connect-vault-flow.ts`:
- Change `connect(vaultId)` (drop `password`, `confirmPassword`).
- Delete the key-transfer enrollment branch: the
  `if (confirmPassword !== undefined && (...)) { await manager.receive(...) }` block.
- Keep the `item.vault.status !== "active"` guard and the `blockingReason` check.
- Call `this.deps.bootstrap({ vaultId }, async () => { ... })` (no password).

`connect-vault-modal.ts` / `remote-vault-modals.ts` / `remote-vault-controller.ts`:
- Remove the "Vault password" and "Confirm password" inputs from both the **create** and
  **connect** forms. Keep the "Vault name" field for create.
- Thread `connect(vaultId)` and `create({ name, organizationId? })` accordingly.

> **Note on sharing:** with org-membership access (migration `0008_organization_vault_access.sql`
> and `apps/api/src/sharing/application/access.ts`), a member of the org already sees and can
> bootstrap the org's vaults — `pending_key` status should no longer occur. Verify this
> during manual testing (Task 6). If a shared vault still shows `pending_key`, that's a
> server sharing-logic issue to investigate before merging this task.

**TDD:** update `connect-vault-flow.test.ts`, `connect-vault-modal.test.ts`,
`remote-vault-controller.test.ts`, `remote-vault-modals.test.ts` to remove password
assertions and cover the no-password path.

**Verify:** `pnpm -C apps/obsidian-plugin test --run` and `pnpm -C apps/obsidian-plugin lint`.

**Commit:** `plugin: passwordless vault connect/create UI`.

---

### Task 5 — Lift the organization limit

**File:** `apps/api/src/auth/better-auth.ts:174`

Change:

```ts
organization({ organizationLimit: 1 }),
```

to a named constant, e.g.:

```ts
const MAX_ORGANIZATIONS_PER_USER = 100; // fork: allow personal/work/household orgs
// ...
organization({ organizationLimit: MAX_ORGANIZATIONS_PER_USER }),
```

Better Auth's `organization` plugin throws `ORGANIZATION_LIMIT_REACHED` in
`createOrganization` when the user's member count reaches `organizationLimit`; there is no
"unlimited" sentinel, so pick a generous bound.

**Also confirm** the default-org hooks still make sense (they do — each new user still gets
a "Personal Organization" via `readDefaultOrganizationIdForUser` /
`defaultOrganizationSlug(user.id)` in `apps/api/src/auth/policies/organization.ts`). No
change needed there for multi-org; `activeOrganizationId` is just a convenience default.

**Verify:** `pnpm -C apps/api test:unit` (auth tests) and `pnpm -C apps/api typecheck`.

**Commit:** `api: allow multiple organizations per user`.

---

### Task 6 — End-to-end manual test (multi-vault + sharing)

Run a local node self-host so you can exercise the full stack:

```sh
# API (check apps/api package.json for the exact dev script; it wraps src/self-host.ts)
pnpm -C apps/api dev
```

Then build and load the plugin into a test vault:

```sh
pnpm -C apps/obsidian-plugin build
```

Test matrix:

1. **Create vault with no password** — pick name → connected → sync a file → verify round-trip on a second device/vault.
2. **Create a second org** — via the Better Auth API for now (`POST /v1/organization` with the session token, or `auth.api.createOrganization`) since the plugin has no create-org UI yet (see Task 7).
3. **Share the household vault** — invite a roommate email into the "Household" org (Better Auth `POST /v1/organization/invite-member`), accept, and confirm they can list + connect the org's vault without any verification-code / key ceremony.
4. **Confirm the org limit is lifted** — creating a 2nd and 3rd org no longer returns `ORGANIZATION_LIMIT_REACHED`.

**Commit:** any fixes surfaced by this pass.

---

### Task 7 (optional but recommended) — Org create + invite UX in the plugin

To make "one personal vault, one work vault, one household vault" actually easy from the
UI, add a small org-management surface. The data model already supports it; this is UI only.

- `apps/obsidian-plugin/src/ui/remote-vault/` — add a "New organization" action and an
  "Invite member" action wired to the Better Auth org endpoints (or to a new thin API
  facade in `packages/sync-client`).
- Reuse `apps/obsidian-plugin/src/app/organization-role-service.ts` for role display.
- Check `apps/obsidian-plugin/src/ui/sharing/sharing-modal.ts` — it already lists orgs and
  vaults; extend rather than duplicate.

This is larger and independent of the crypto work — split it into its own PR.

---

## 3. Stage 2 (optional cleanup, separate PR) — delete the dead key plumbing

After the above, `remoteVaultKey`/`StoredRemoteVaultKeySecret` are ignored. A mechanical
cleanup can remove them:

- `packages/sync-client/src/remote-vault/types.ts` — drop `RemoteVaultSession.remoteVaultKey`, `StoredRemoteVaultKeySecret`.
- `packages/sync-client/src/remote-vault/manager.ts` — drop `IDENTITY_REMOTE_VAULT_KEY`, the `getStoredRemoteVaultKeySecret`/`saveStoredRemoteVaultKeySecret` deps, and key-secret calls.
- `packages/sync-client/src/sync/store/ports.ts:88` — drop `options: { remoteVaultKey }` from `applyAcceptedPushBatch`.
- `packages/sync-client/src/sync/engine/*` and `sync/runtime/*` — drop the `remoteVaultKey` first arg from the `encrypt*/decrypt*` helper call sites (or simplify the helper signatures).
- `apps/obsidian-plugin/src/app/plugin-controller.ts:178,837`, `sync-controller.ts:60,106` — remove `getRemoteVaultKey` wiring.
- `apps/obsidian-plugin/src/adapters/remote-vault-device-storage.ts` and `secret-scope.ts` — delete (no stored key secret).
- `apps/obsidian-plugin/src/app/__tests__/readiness-helpers.ts`, `plugin-controller-readiness.test.ts` — drop key fixtures.
- Optionally delete `packages/vault-crypto` once nothing imports it (the sharing key-transfer
  ceremony also imports it — see Stage 3).

---

## 4. Stage 3 (optional) — remove the sharing key-transfer ceremony

With identity crypto there is no vault key to transfer. The org-membership model already
grants access, so these are dead:

- Client: `packages/sync-client/src/sharing/manager.ts`, `sharing/client.ts` key-transfer
  paths; `apps/obsidian-plugin/src/ui/sharing/sharing-modal.ts` verification-code UI.
- Server: `apps/api/src/sharing/application/service.ts` key-request flow,
  `apps/api/src/db/d1/sharing-schema.ts` tables `vault_key_request`, `sharing_refresh`,
  `sharing_audit` (drop via a new Drizzle migration).

Only after Stage 2. Low priority for the fork's goal.

---

## 5. Test commands (reference)

```sh
pnpm typecheck                                  # whole workspace

pnpm -C packages/sync-client test --run         # crypto + engine regression net
pnpm -C packages/vault-crypto test --run        # until the package is removed

pnpm -C apps/api test:unit
pnpm -C apps/api test:integration:cloudflare
pnpm -C apps/api test:e2e:node
pnpm -C apps/api typecheck

pnpm -C apps/obsidian-plugin test --run
pnpm -C apps/obsidian-plugin typecheck
pnpm -C apps/obsidian-plugin lint
pnpm -C apps/obsidian-plugin build
```

## 6. Risks / watch-outs

- **Client/server API change is coupled** (Tasks 2–3): an old plugin talking to a new
  server (or vice versa) will fail to create/connect a vault. Deploy both sides together.
- **Existing data is not migrated.** `encrypted_metadata` rows and R2 blobs already written
  by a pre-fork deployment are AES-GCM ciphertext; the identity client cannot parse them.
  For a fresh fork this is irrelevant. If you must preserve an existing deployment, do a
  one-time client-side export/re-import before switching — do **not** attempt server-side
  decryption (the server has no keys).
- **`encryptedSyncBlobSize` semantics** flip from "encrypted size" to "plaintext size"
  (`push-mutation-preparer.ts:93`). This is correct because the server's storage accounting
  (`vault_sync_status.storage_used_bytes`) now measures the plaintext bytes the client
  uploads. Re-verify the file-size-blocked path in Task 6.
- **Sharing `pending_key` status** — if Task 6 reveals a shared vault stuck in
  `pending_key`, stop and investigate `apps/api/src/sharing/application/access.ts` before
  shipping Task 4.
