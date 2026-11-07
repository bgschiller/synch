# Sync Without E2EE: Target Design & Migration Plan

Status: design proposal (no implementation yet).

## 1. Summary

E2EE was removed in stages before this session (commits `23b4a55`…`8d0cf4d`,
then `74f1498`). What remains is the **identity/passthrough crypto layer** —
an `encrypt`/`decrypt` API that returns its inputs unchanged — plus a handful of
**E2EE-era schema/column names** that now hold plaintext.

This document answers two questions:

1. What would the codebase look like if E2EE had never been a goal?
2. How do we get there without breaking the on-wire sync format or existing vaults?

**Recommendation in one line:** remove the crypto abstraction (Phase 1, no
migration) and drop the one genuinely dead column `vault.active_key_version`
(Phase 2, one D1 migration). **Keep** the `encryptedMetadata` /
`encrypted_metadata` names as-is — they are stale but *live* (they carry the
plaintext metadata), and renaming them is a breaking wire/DO change with no
functional payoff. The optional full rename is documented as Phase 3 and
explicitly deferred.

**Status:** Phase 1 and Phase 2 are **done and merged** (see commit history).
Phase 3 is **declined** — even with full device control the local
pending-mutation migration risk and the DO rolling-deploy window remain, and the
rename is purely cosmetic. The `encrypted*` names are intentionally kept as
legacy names for "the plaintext metadata bytes."

## 2. Current state: three surfaces

### 2.1 Client crypto seam — the interface to remove

`packages/sync-client/src/sync/core/crypto.ts` defines:

- `SyncCryptoError` (class, never thrown by identity crypto — `code: "disposed"` only)
- `SyncCryptoContext` interface + `IdentitySyncCryptoContext` (identity impl)
- `createSyncCryptoContext()`
- `encryptSyncMetadata` / `decryptSyncMetadata` → `serializeSyncedEntryMetadata` / `parseSyncedEntryMetadata`
- `encryptSyncBlob` / `decryptSyncBlob` → identity (bytes unchanged)
- `encryptedSyncBlobSize(n)` → `n`

The actual serialization/parsing logic already lives in
`packages/sync-client/src/sync/core/content.ts`:
`serializeSyncedEntryMetadata` = `JSON.stringify({path, hash})`,
`parseSyncedEntryMetadata` = validated JSON parse. `SyncedEntryMetadata = { path: string; hash: string | null }`.

**Exact production consumers of `crypto.ts`** (15 files — these are the only
files that import the crypto *module*):

| File | Uses |
|---|---|
| `packages/sync-client/src/sync/engine/event-recorder.ts:5,314` | `decryptSyncMetadata` |
| `packages/sync-client/src/sync/engine/pull-entry-state-applier.ts:5,139` | `decryptSyncMetadata` |
| `packages/sync-client/src/sync/engine/pull-manifest-planner.ts:6` | `decryptSyncMetadata` |
| `packages/sync-client/src/sync/engine/file-size-blocked.ts:2` | `decryptSyncMetadata` |
| `packages/sync-client/src/sync/engine/push-mutation-preparer.ts:11-14,33,47,93,109-112,182-188` | `createSyncCryptoContext`, `encryptedSyncBlobSize`, `SyncCryptoContext`, `getSyncCryptoContext` fallback |
| `packages/sync-client/src/sync/engine/push-mutation-committer.ts:7` | (multi import) |
| `packages/sync-client/src/sync/engine/push-service.ts:12-14,145,147,359,419,422` | `createSyncCryptoContext`, `SyncCryptoContext`, `.dispose()`, `getSyncCryptoContext` dep |
| `packages/sync-client/src/sync/engine/push-mutation-types.ts:7,20` | `SyncCryptoContext` type; `getSyncCryptoContext?` dep field |
| `packages/sync-client/src/sync/engine/pull-blob-preparer.ts:6,113,118,156` | `createSyncCryptoContext`, `decryptSyncBlob`, `encryptBlob` |
| `packages/sync-client/src/sync/engine/local-reconcile-service.ts:6,50,67,305` | `createSyncCryptoContext`, `SyncCryptoContext`, `decryptMetadata` |
| `packages/sync-client/src/sync/engine/pull-pending-mutation-handler.ts:10` | (multi import) |
| `packages/sync-client/src/sync/engine/vault-config-reapply.ts:3` | `decryptSyncBlob` |
| `packages/sync-client/src/sync/core/mutation-queue.ts:1,39,57,76,108,123,139` | `createSyncCryptoContext`, `SyncCryptoContext`, `encryptMetadata` |
| `packages/sync-client/src/sync/store/entry-record.ts:1,372,380` | `decryptSyncMetadata`, `encryptSyncMetadata` |
| `packages/sync-client/src/sync/runtime/version-history-service.ts:5` | `decryptSyncBlob`, `decryptSyncMetadata`, `encryptSyncMetadata` |

Public re-export: `packages/sync-client/src/core.ts:4` does
`export * from "./sync/core/crypto"`. The Obsidian plugin imports these helpers
via `@synch/sync-client/core` (e.g. `apps/obsidian-plugin/src/adapters/dexie-store.test.ts:1`).

**Important distinction.** A wider set of files (the handoff's ~25-file list —
`push-service.ts`, `pull-service.ts`, `changes.ts`, `realtime-types.ts`,
`store.ts`, `portable-path.ts`, etc.) carry the **field names**
`encryptedMetadata` / `encryptedBytes` / `encryptedSizeBytes` through the data
model (`EntryRecord`, `PendingMutationRow`, DTOs). Those are *names on plain
data*, not the crypto interface. They are NOT touched in Phase 1.

### 2.2 D1 schema (`apps/api/src/db/d1/`, 13 tables)

`apps/api/drizzle.config.ts` → schema `./src/db/d1/index.ts`, out `./drizzle`.

Tables: `user`, `session`, `account`, `verification`, `organization`, `member`,
`invitation`, `device_code` (auth-schema.ts); `vault`, `vault_membership`,
`vault_sync_status` (vault-schema.ts); `sharing_audit`, `sharing_refresh`
(sharing-schema.ts).

**The only E2EE-shaped dead column is `vault.active_key_version`**
(`apps/api/src/db/d1/vault-schema.ts:22`, `integer("active_key_version").notNull()`,
always written as `1`). There are **no** `envelope`, `key_version`, or
`ciphertext` columns left in D1. Already dropped in prior migrations:
`vault_key_wrapper` + `vault_key_request` (0009), polar billing tables +
`polar_customer_id`/`synced_vaults_override` (0010).

`active_key_version` is serialized into every vault HTTP response via
`VaultRecord` (`apps/api/src/vault/domain/types.ts:5`), mapped in
`apps/api/src/vault/adapters/outbound/drizzle-vault-store.ts:85,381,417`, and
echoed by routes `apps/api/src/vault/adapters/inbound/http/routes.ts:25,55,94,120`.
The client copies it into its session summary
(`packages/sync-client/src/remote-vault/types.ts:5,25`,
`packages/sync-client/src/remote-vault/manager.ts:124,214`) but **never uses it
for logic** — it is vestigial end-to-end.

### 2.3 Durable Object schema + wire format

The Durable Object has its **own, separate** migration system
(`apps/api/drizzle-do.config.ts` → schema `./src/db/do/index.ts`, out
`./drizzle-do`; migrations `0000…0008`, generated `migrations.js`, snapshots for
all 8). DO tables: `sync_access_revocations`, `entries`, `entry_versions`,
`blobs`, `coordinator_state`, `maintenance_jobs`, `local_vault_connections`.

Two migrator paths:
- Cloudflare DO: `drizzle-orm/durable-sqlite/migrator` +
  `doMigrations` from `drizzle-do/migrations.js`
  (`apps/api/src/sync-coordinator/adapters/outbound/storage-lifecycle/durable-object-storage.ts:11-13`).
- Node/self-host: `better-sqlite3/migrator` reading the `drizzle-do` folder
  (`apps/api/src/sync-coordinator/adapters/outbound/sqlite/storage-lifecycle.ts:17-19`).

The two `encrypted_metadata` columns are **live** (they hold the plaintext JSON
metadata now), not dead weight:
- `apps/api/src/db/do/index.ts:22` — `entries.encryptedMetadata: text("encrypted_metadata").notNull()`
- `apps/api/src/db/do/index.ts:44` — `entryVersions.encryptedMetadata: text("encrypted_metadata").notNull()`

Wire format: the websocket protocol field is `encryptedMetadata`
(`apps/api/src/sync-coordinator/adapters/inbound/websocket/protocol.ts:16,101`
in `commit_mutations` and `restore_entry_versions`; same name in
`apps/api/src/sync-coordinator/application/dto/protocol-types.ts:7,61`).

R2 blobs are stored as **raw bytes** keyed by `blobId` — there is no envelope;
the "ciphertext" references are comments only
(`apps/api/src/sync-coordinator/application/services/mutation-service.ts:224`,
`blob-gc-policy.ts:84`, README).

## 3. Target design ("E2EE never existed")

The ideal end state, stated once so every later decision is judged against it:

- **No crypto module.** Metadata is serialized/parsed directly with
  `serializeSyncedEntryMetadata` / `parseSyncedEntryMetadata` from `content.ts`.
  Blob bytes pass through untouched. There is no `SyncCryptoContext`, no
  `encrypt`/`decrypt`, no `encryptedSyncBlobSize`, no `SyncCryptoError`.
- **No injected crypto dependency.** `push-mutation-preparer` /
  `push-service` / `mutation-queue` / `local-reconcile-service` no longer hold a
  `getSyncCryptoContext` dependency or a `fallbackCryptoContext`.
- **Plain names.** Model fields are `metadata`, `bytes`, `sizeBytes`,
  `blockedSizeBytes` (not `encryptedMetadata`, `encryptedBytes`,
  `encryptedSizeBytes`, `blockedEncryptedSizeBytes`).
- **Schema.** `vault` has no `active_key_version`; DO columns are
  `entries.metadata` / `entry_versions.metadata`; the wire protocol field is
  `metadata`.
- **No `envelope` / `key_version` / `ciphertext` anywhere** (already true — the
  remaining instances are stale names, not structures).

## 4. The naming/compat decision

The ideal above conflicts with the hard constraint *"keep the on-wire sync
format and existing vaults intact."*

- The **abstraction** (crypto context + identity helpers) is genuinely dead —
  removing it changes no bytes on the wire or in storage. Safe to remove now.
- The **`encryptedMetadata` names** (client fields, DO columns, wire field) are
  *live* plaintext carriers with stale names. Renaming them:
  - breaks the wire protocol (old client ↔ new server and vice versa fail zod
    validation), requiring a coordinated flag-day deploy or a transient
    dual-field protocol;
  - requires a DO `RENAME COLUMN` migration + regenerated `migrations.js`;
  - requires client **local-store** migrations (Dexie/IndexedDB in the plugin,
    SQLite in the CLI) because `EntryRecord.pendingEncryptedMetadata` /
    `CachedSyncBlobRow.encryptedBytes` are persisted locally.

**Decision:** do not rename. Keep `encryptedMetadata` / `encrypted_metadata` as
a documented legacy name for "the JSON metadata bytes." This mirrors the
decision already recorded in `docs/migration-notes-e2ee-removal.md`
("keeping the names was deliberate"). Phase 3 below is a documented, optional
flag-day for teams that want the pure ideal and can absorb a wire break.

## 5. Phased migration plan (code-first)

### Phase 1 — delete the crypto abstraction (no migration, no wire change)

Purely mechanical; fully non-breaking.

1. Replace every `encryptSyncMetadata(m, ctx)` → `serializeSyncedEntryMetadata(m)`,
   `decryptSyncMetadata(s, ctx)` → `parseSyncedEntryMetadata(s)`,
   `encryptSyncBlob(b, ctx)` → `b`, `decryptSyncBlob(b, ctx)` → `b`,
   `encryptedSyncBlobSize(n)` → `n`.
2. Delete `SyncCryptoContext`, `IdentitySyncCryptoContext`,
   `createSyncCryptoContext`, `SyncCryptoError`, and the five helpers from
   `crypto.ts`; then delete the file.
3. Remove the injection plumbing:
   - `push-mutation-types.ts` — drop `getSyncCryptoContext?` (line 20) and the
     `SyncCryptoContext` import.
   - `push-mutation-preparer.ts` — drop `fallbackCryptoContext` (line 33),
     `getSyncCryptoContext()` (182-188), inline serialize at 47-49 / 109-112.
   - `push-service.ts` — drop `createSyncCryptoContext()` (145), the
     `syncCryptoContext` plumbing (147, 359, 419, 422), the `.dispose()` call.
   - `mutation-queue.ts` and `local-reconcile-service.ts` — drop
     `createSyncCryptoContext()` (39 / 50) and the `metadataCrypto: Pick<...>`
     params (57, 67 / 123); call serialize/parse directly.
4. `packages/sync-client/src/core.ts:4` — remove the `crypto` re-export; add a
   re-export of `content.ts` if the plugin needs `serializeSyncedEntryMetadata`
   / `parseSyncedEntryMetadata`.
5. Keep all field names (`encryptedMetadata`, `encryptedBytes`, …) unchanged.

**Migrations:** none. **Wire:** unchanged. **Vaults:** untouched.

### Phase 2 — drop `vault.active_key_version` (one D1 migration)

1. Remove `activeKeyVersion` from:
   - `apps/api/src/db/d1/vault-schema.ts:22` (the column definition);
   - `apps/api/src/vault/domain/types.ts:5` (`VaultRecord`);
   - `apps/api/src/vault/adapters/outbound/drizzle-vault-store.ts:85,381,417`
     (insert select-list, listVaultsForUser select-list, row→record map);
   - `apps/api/src/vault/adapters/inbound/http/routes.ts:25,55,94,120`
     (response serialization);
   - `apps/api/src/sharing/application/store.ts:5` (`SharingVault`);
   - client `packages/sync-client/src/remote-vault/types.ts:5,25` and
     `packages/sync-client/src/remote-vault/manager.ts:124,214`;
   - test fixtures (`apps/api/src/sharing/sharing.test.ts:48,159`,
     `apps/api/src/sharing/migration.test.ts:30,90`,
     `apps/obsidian-plugin/src/app/__tests__/readiness-helpers.ts:66`,
     `apps/obsidian-plugin/src/app/plugin-controller-readiness.test.ts:176,277,406`,
     `packages/sync-client/src/remote-vault/manager-test-helpers.ts:70`).
   - **Gotcha — raw positional insert:** `createVaultForUser` inserts via a raw
     `sql` template whose `SELECT` lists column values positionally
     (`apps/api/src/vault/adapters/outbound/drizzle-vault-store.ts:182-187`);
     the `1` in that `SELECT` is `active_key_version`. Removing the column means
     deleting that `1` from the raw SQL and shifting nothing else (it sits at
     position 5 of 9). `toVaultRecord` (line ~417) also drops the field.
2. `pnpm -C apps/api db:generate` → produces `0011_*.sql` containing
   `ALTER TABLE "vault" DROP COLUMN "active_key_version";`.
   - **Gotcha (inherited):** `drizzle-kit generate` diffs against the latest
     snapshot. `0010_snapshot.json` is the latest and is accurate (verified: it
     contains `active_key_version` at line 773 and does **not** contain
     `vault_key_wrapper`/`vault_key_request`/polar tables), so this generation
     should be clean. **Still hand-inspect the SQL** for redundant re-drops —
     the 0009 snapshot-less quirk bit us last session and is worth re-checking
     every `db:generate`.
   - `active_key_version` has no index/constraint, so the `DROP COLUMN` is clean
     (D1 SQLite ≥ 3.35). Note the column order in the `SELECT` above must stay
     in sync with the remaining 8 columns.
3. Deploy order (matches the community path `deploy:cloudflare:community` =
   `wrangler deploy` **then** `db:migrate:cloudflare:community`): new code stops
   writing/selecting the column, then the migration drops it. No race window.

**Effect:** vault HTTP JSON loses `activeKeyVersion` — a client-visible response
change → **flag the Obsidian plugin** (see §7).

### Phase 3 — optional, BREAKING: rename `encryptedMetadata` → `metadata`

Only if the stale names are judged worth a flag-day. Not required by the goals.

1. Client model: rename `pendingEncryptedMetadata` → `pendingMetadata`,
   `encryptedBytes` → `bytes`, `blockedEncryptedSizeBytes` →
   `blockedSizeBytes`, etc. → **requires local-store migrations** (Dexie version
   bump in `apps/obsidian-plugin/src/adapters/dexie-store/`, SQLite migration in
   the CLI store).
2. DO: `pnpm -C apps/api db:generate:do` after renaming the two columns in
   `apps/api/src/db/do/index.ts:22,44` → new `drizzle-do/0009_*.sql` with
   `ALTER TABLE entries RENAME COLUMN encrypted_metadata TO metadata;` +
   same for `entry_versions`; regenerate `migrations.js`.
3. Wire: rename `encryptedMetadata` → `metadata` in
   `apps/api/src/sync-coordinator/adapters/inbound/websocket/protocol.ts` and
   `apps/api/src/sync-coordinator/application/dto/protocol-types.ts`. **This is
   a hard break** — old/new clients and servers mismatch. Ship client and server
   in lockstep, or add a transient dual-field protocol (accept both, emit new).
4. R2: no change (already raw bytes).

## 6. Migration mechanics reference

- **D1** (`apps/api/drizzle/`, migrations 0000–0010): applied by
  `drizzle-orm/migrator` — `apps/api/src/runtime/node.ts:58` (libsql, self-host
  startup), and the community deploy path
  `pnpm -C apps/api db:migrate:cloudflare:community`
  (`apps/api/scripts/migrate-cloudflare-community.mjs`), wired into
  `deploy`/`upgrade` scripts.
- **DO** (`apps/api/drizzle-do/`, migrations 0000–0008): generated via
  `pnpm -C apps/api db:generate:do`; applied at DO instantiation via
  `durable-sqlite/migrator` (Cloudflare) and `better-sqlite3/migrator` (node).
  All 8 have snapshots, so `db:generate:do` has no snapshot gap.
- The snapshot quirk to remember: `0009_passwordless_auto_enrollment.sql` was
  hand-written with **no** snapshot; a naive `db:generate` at the time
  re-proposed its drops. `0010_snapshot.json` now exists and is correct, but
  **inspect every generated migration for redundant/re-failing statements.**

## 7. Tests that must change

**Phase 1** (crypto removal):
- Delete `packages/sync-client/src/sync/core/crypto.test.ts`.
- `packages/sync-client/src/sync/engine/__tests__/event-recorder/helpers.ts` —
  swap `encryptTestMetadata`/`decryptPendingMetadata` to `serialize`/`parse`.
- `packages/sync-client/src/sync/engine/__tests__/pull-service/helpers.ts` —
  `encryptRemoteMetadata`/`encryptPendingMetadata`/`encryptTestBlob` become
  serialize/parse/identity.
- `packages/sync-client/src/sync/engine/__tests__/pull-service/detached-buffer-regression.test.ts`,
  `sync-state-concurrency.test.ts` — direct serialize/parse.
- `apps/obsidian-plugin/src/adapters/dexie-store.test.ts` — imports from
  `@synch/sync-client/core`; switch to `content.ts` exports.
- Any engine test importing `getSyncCryptoContext` (verify with `rg`).

**Phase 2** (`active_key_version` removal): the fixtures listed in §5 Phase 2.

**Phase 3**: Dexie/CLI local-store migration tests + protocol validation tests.

## 8. Obsidian plugin impact & release notes

Per `AGENTS.md`, changes touching `apps/obsidian-plugin` or
`packages/sync-client` require updating `apps/obsidian-plugin/release-notes/next.md`.

- **Phase 1** is internal to `packages/sync-client` (public `@synch/sync-client/core`
  surface changes: the crypto helpers vanish). → add a `Changed` entry.
- **Phase 2** changes the vault HTTP response shape (`activeKeyVersion` removed)
  and the client `RemoteVaultRecord`/`RemoteVaultSessionSummary` types. →
  add a `Changed` entry noting the removed field.
- **Phase 3** is a wire-format break: the plugin must ship in lockstep with the
  server, or clients must tolerate both field names. → flag before implementing.

## 9. Open questions

- Does any *external* consumer rely on `@synch/sync-client/core`'s crypto
  exports (outside this monorepo)? If so, Phase 1 needs a deprecation shim
  before removal. *(Resolved: no external consumer — single-user fork. Phase 1
  removed the exports directly.)*
- Is a dual-field protocol transition (Phase 3) acceptable, or is a flag-day
  deploy fine given the fork currently has effectively zero deployed fleet?
  *(Resolved: Phase 3 declined entirely — not doing the rename.)*
- Should Phase 1 also delete `SyncCryptoError` from any remaining public
  re-exports, or is it referenced by the plugin's error handling? *(Resolved:
  deleted with `crypto.ts`; no plugin references remained.)*
