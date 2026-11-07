# Next Obsidian plugin release

## Added

## Changed

- Removed the subscription and billing system. All accounts now have full organization sharing with no plan limits, upgrade prompts, or renewal pauses.
- Removed non-English interface translations. The plugin now ships English-only.
- Removed the cloud-specific plugin update check; update and server-compatibility prompts are now the same on self-hosted and cloud servers.
- Removed the leftover end-to-end encryption scaffolding. Encryption was already a no-op (vaults sync as plaintext); this only deletes the unused encrypt/decrypt interfaces and the obsolete `activeKeyVersion` vault field.

## Fixed
