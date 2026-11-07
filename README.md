<h1 align="center">Synch</h1>

<p align="center">Simple sync for Obsidian.</p>

<p align="center">
  <a href="apps/api/install.sh">Self-hosting install script</a> ·
  <a href="apps/api/docker-compose.yml">Docker Compose</a>
</p>

<p align="center">
  <a href="https://obsidian.md/plugins?id=synch"><img alt="Obsidian Community Plugin" src="https://img.shields.io/badge/Obsidian-Community%20Plugin-7c3aed?style=flat-square" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" /></a>
</p>

<p align="center">
  <img alt="Synch overview" src=".github/assets/synch-preview.webp" />
</p>

---

Keep your Obsidian vault in sync across devices with version history and
conflict-safe file handling.

Synch is an independent community plugin and service. It is not affiliated with
Obsidian.

## Why Synch?

- **Simple to set up** — Connect a remote vault and start syncing.
- **Fast sync** — Changes are detected frequently and synced across devices.
- **Recoverable** — Restore previous versions and deleted files from sync history.
- **Conflict-safe** — Non-overlapping Markdown edits can be merged automatically.
- **Your choice of hosting** — Use Synch Cloud or run your own Synch server.

## How it works

```mermaid
flowchart LR
    device["Your device"] --> server["Synch Cloud or your self-hosted server"]
    server --> other["Download on another device"]
```

The sync service stores file blobs and sync metadata as plaintext. There is no
end-to-end encryption; the hosted service can read your notes and file paths.

## Compare Obsidian sync options

Every option has a different balance of convenience, control, and setup effort.

| Option | Encryption | Storage model | Conflict handling | Best fit |
| --- | --- | --- | --- | --- |
| **Synch** | None (plaintext) | Synch Cloud or self-hosted | Automatically merges non-overlapping Markdown edits; preserves overlapping conflicts | Users who want a simple, open-source workflow |
| [Obsidian Sync](https://obsidian.md/sync) | E2EE by default; standard encryption is also available | Obsidian-hosted | Official Obsidian integration and sync history | Users who prefer the official hosted service |
| [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) | E2EE | Self-hosted CouchDB, object storage, or optional WebRTC | Automatically merges simple conflicts | Users who want maximum backend control |
| [Remotely Save](https://github.com/remotely-save/remotely-save) | Optional password-based E2EE | Your S3, WebDAV, Dropbox, OneDrive, Google Drive, and other storage | Basic conflict detection; advanced smart conflict handling is available in Pro | Users who already have a preferred storage provider |

This comparison is intentionally high-level. Check each project's current
documentation and settings before migrating an important vault.

## Features

- Near-instant synchronization
- Version history
- Deleted file recovery
- Automatic Markdown conflict merging
- Conflict copies when edits overlap
- Markdown files enabled by default
- Images, audio, video, and PDF files enabled by default
- Additional file and folder exclusions
- Hosted Synch Cloud
- Custom API URLs for self-hosted deployments
- Desktop and mobile Obsidian support

## Get started

### Synch Cloud

1. Open **Settings → Community plugins** in Obsidian.
2. Turn off Restricted mode and select **Browse**.
3. Search for **Synchrun**.
4. Install and enable the plugin.
5. Open Synchrun's settings and sign in.
6. Create or connect a remote vault.

Once connected, keep Obsidian open while Synch uploads local changes and
downloads remote changes.

### Self-hosted Synch

You can run Synch on:

- Cloudflare — deploy `apps/api` using [`wrangler.jsonc`](apps/api/wrangler.jsonc)
- Docker — [`docker-compose.yml`](apps/api/docker-compose.yml)
- Your own hardware with systemd — [`install.sh`](apps/api/install.sh)

After deployment, set the custom API base URL in the plugin settings.

## Safety notes

Always create a full backup of your vault before:

- Installing a new synchronization provider
- Migrating from another sync solution
- Resetting or reconnecting a remote vault

Do not run multiple synchronization providers against the same vault unless you
fully understand how their file watchers and conflict resolution interact.

### Disclosures

<details>
<summary>Show disclosures</summary>

This section is provided for Obsidian developer policy review and for users who
want to understand what the plugin does before installing it.

### Account requirements

Synch requires a Synch account to use the hosted sync service. The account is
used to authenticate devices, create and connect remote vaults, issue sync
tokens, enforce storage limits, and manage service access.

### Network use

Synch connects to the configured Synch API base URL over HTTPS and WebSocket
connections. For the hosted service, this is Synch-operated infrastructure.
The default hosted API endpoint is `https://api.synch.run`, and realtime sync
uses `wss://api.synch.run` WebSocket connections. The plugin uses network
requests to:

- Sign in and maintain an authenticated device session.
- Create, list, and connect remote vaults.
- Upload file blobs and sync metadata.
- Download file blobs and sync metadata.
- Exchange realtime sync messages over WebSocket connections.
- Read account, billing, quota, storage, and sync status.

Synch-hosted infrastructure uses third-party providers, including Cloudflare for
hosting, storage, networking, databases, queues, and related infrastructure.
Billing is handled by Polar.

### Data sent to Synch

Vault file contents and file path metadata are uploaded as plaintext and stored
as plaintext blobs and sync metadata. There is no end-to-end encryption; the
hosted service can read your notes and file paths.

Synch processes operational metadata such as account information, vault
identifiers and names, organization and membership records, local vault
identifiers, blob identifiers, file sizes, storage usage, timestamps, sync
cursors, session information, IP addresses, User-Agent strings, billing
identifiers for hosted subscriptions, and similar operational metadata.

### Local vault access

Synch reads and writes files inside the current Obsidian vault so it can sync
selected vault files. It stores plugin settings with Obsidian's plugin data
API, stores the device session token with Obsidian's secret storage API, and
stores local sync state in browser IndexedDB.

Synch does not intentionally read or write files outside the current Obsidian
vault.

### Payments

The hosted service offers free and paid subscription plans. The current paid
hosted plan is Sync Starter, available with monthly or annual billing. Payment
processing and subscription management are handled by Polar.

### Telemetry, ads, and privacy

The Synch Obsidian plugin does not include client-side telemetry and does not
show ads. The hosted service may process operational logs and service metadata
needed to run, secure, troubleshoot, and improve the service.

</details>

## Contributing

Issues, bug reports, documentation improvements, and pull requests are
welcome. See the [contributing guide](CONTRIBUTING.md) for more about when to
open an issue or a pull request.

## License

Synch is open source under the [MIT License](LICENSE).
