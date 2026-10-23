# Migration Notes: E2EE Removal & Passwordless Multi-Vault

Fork of [hjinco/synch](https://github.com/hjinco/synch) → [bgschiller/synch](https://github.com/bgschiller/synch).

**Branch:** `remove-e2ee-passwordless` (11 commits, `23b4a55` → `8d0cf4d`).

**Plan:** see [`docs/plans/remove-e2ee-passwordless-multi-vault.md`](plans/remove-e2ee-passwordless-multi-vault.md) for the full task breakdown.

## What changed (commits)

| Commit | What |
|---|---|
| `23b4a55` | **Task 1** — Identity `SyncCryptoContext`: E2EE cipher removed, crypto becomes pass-through |
| `136ef24` | **Task 2** — Passwordless remote-vault create/connect in sync-client |
| `6368326` | **Task 3** — API: vault creation no longer requires a key wrapper |
| `4ccd8bd` | **Task 4** — Plugin + CLI: passwordless connect/create UX |
| `0d4ff31` | **Task 5** — Org limit 1 → 100 |
| `cde6ee2` | **Stage 2** — Delete dead vault-key plumbing (client + hosts) |
| `c91c73a` | **Stage 3 (server)** — Passwordless sharing via org auto-enrollment |
| `0b4d67c` | **Stage 3 (client)** — Remove vault key-transfer ceremony |
| `5fd1c56` | **Stage 3 (tests)** — Update sharing integration + e2e tests for auto-enrollment |
| `0c6569e` | **Task 7** — Organization create + invite UX |
| `8d0cf4d` | Plugin manifest fork branding |

## Architecture changes

### Crypto is now a no-op ("identity")

`packages/sync-client/src/sync/core/crypto.ts` — the five exported helpers
(`encryptSyncMetadata`, `decryptSyncMetadata`, `encryptSyncBlob`,
`decryptSyncBlob`, `deriveSyncUsageKey`) and `createSyncCryptoContext` return
their inputs unchanged. `encryptedSyncBlobSize` == plaintext byte length.

**Important compatibility note:** the DB/R2/DO column and blob names were
**not** renamed. `encrypted_metadata` now holds plaintext JSON (`{"path","hash"}`),
and the R2 "encrypted" blobs are raw file bytes. Durable Object `entries` store
`encryptedMetadata` verbatim. Renaming would have required schema migrations and
touched the whole coordinator; keeping the names was deliberate. The
`SyncCryptoError` type and all engine call sites are unchanged — the engine was
already isolated behind the five helpers.

### Sharing = org auto-enrollment (no key ceremony)

- Deleted: `vault_key_wrapper` + `vault_key_request` tables and the key-transfer
  ceremony (client `sharing/manager.ts` + `sharing/client.ts`).
- Kept: `sharing_audit` + `sharing_refresh` (used by org invite/accept/change/remove).
- Access gate is **org membership + active `vault_membership` row**
  (`apps/api/src/vault/application/drizzle-vault-store.ts`
  `readAccessibleVaultRowForUser`, and `apps/api/src/org/application/policy.ts`
  `canAccessVault`).
- **Auto-enrollment** (migration `0009_passwordless_auto_enrollment.sql`):
  - `createVaultForUser` inserts an active `vault_membership` row for **every**
    org member, not just the creator.
  - `acceptInvitation` inserts an active `vault_membership` for every existing
    vault in the org.

### Org limit

`MAX_ORGANIZATIONS_PER_USER = 100` in
`apps/api/src/auth/policies/organization.ts` (used by
`apps/api/src/auth/better-auth.ts` `organization({ organizationLimit })`).
There is no "unlimited" sentinel — use a high constant.

## Deployed environment (as of this migration)

- **Worker:** `https://synch-api.bgschiller.workers.dev` (version `6f10b49d`)
- **Account:** `bgschiller@gmail.com` (ID `6856c9a4233d650ac524d779c64d61da`),
  wrangler OAuth token at `~/.config/.wrangler/config/default.toml`
- **Bindings:** `DB` → `synch-db` (D1), `SYNC_BLOBS` → `synch-bucket` (R2),
  `SYNC_COORDINATOR` (Durable Object)
- **Vars:** `SELF_HOSTED=true`, `SYNC_TOKEN_TTL_SECONDS=120`,
  `AUTH_ALLOWED_EMAILS="bgschiller@gmail.com,morganlschiller@gmail.com,cjschill@hotmail.com,household@schiller.town"`
- **Secrets:** `BETTER_AUTH_SECRET`, `SYNC_TOKEN_SECRET`
- **Data:** wiped to a clean slate — 0 users, 0 orgs, 0 vaults, 0 sessions.
  Old Durable Object state + R2 blobs are orphaned (unreachable, harmless).

## Deploy / build commands

```sh
# Deploy (also runs D1 migrations)
pnpm -C apps/api deploy:cloudflare:community

# Local self-host server (auto-applies migrations, needs apps/api/.env)
pnpm -C apps/api dev:node     # http://127.0.0.1:8787

# Build the plugin (API_BASE_URL is required — esbuild errors without it)
API_BASE_URL=https://synch-api.bgschiller.workers.dev pnpm -C apps/obsidian-plugin build
# output: apps/obsidian-plugin/dist/{main.js,manifest.json,styles.css}
```

Install: copy `dist/` into `<vault>/.obsidian/plugins/synch/`. Plugin `id` is
`synch`, name `Synchrun`.

## Operational gotchas (learned the hard way)

1. **`wrangler` is not global.** Always `pnpm exec wrangler ...` from
   `apps/api` (it's a workspace devDependency).
2. **Browser login over SSH** requires port-forwarding the OAuth callback
   (default port `8976`):
   ```sh
   # separate local terminal:
   ssh -L 8976:localhost:8976 brian@<server>
   # in the ssh session:
   cd apps/api && pnpm exec wrangler login --browser=false
   # open the printed URL in the local browser; authorize; the redirect
   # to localhost:8976 tunnels back to the remote wrangler.
   ```
   Alternative: API token via `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.
3. **`AUTH_ALLOWED_EMAILS` is a plaintext var, not a secret** (left over from a
   dashboard config). The fork's `wrangler.jsonc` declares it under
   `secrets.required`, so `wrangler secret put AUTH_ALLOWED_EMAILS` fails with
   "already in use". Functionally identical (code reads it from env either way).
   To convert to a secret: delete the dashboard var first, then `secret put`.
4. **`wrangler d1 list` reports stale `num_tables: 0`** — don't trust it. Verify
   schema with
   `wrangler d1 execute synch-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"`.

## Remaining work

- **Task 6 — manual E2E smoke test** (not automated). Sign up with an allowlisted
  email → create vault (name + org) → verify files sync between devices.
- **Publishing the plugin** (optional): via BRAT pointing at a
  `github.com/bgschiller/synch` release, **or** the Obsidian community directory
  (requires renaming the plugin `id` from `synch` to avoid collision with the
  upstream listing).
