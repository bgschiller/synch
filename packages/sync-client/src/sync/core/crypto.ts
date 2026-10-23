import type { SyncedEntryMetadata } from "./content";
import { parseSyncedEntryMetadata, serializeSyncedEntryMetadata } from "./content";

export type SyncCryptoErrorCode = "disposed";

/**
 * Retained for public-API compatibility; identity crypto never throws this.
 * TODO(identity): remove once `core.ts` / `remote.ts` re-export cleanup lands.
 */
export class SyncCryptoError extends Error {
  constructor(
    readonly code: SyncCryptoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SyncCryptoError";
  }
}

export type SyncMetadataCryptoContext = {
  entryId: string;
  revision: number;
  op: "upsert" | "delete";
  blobId: string | null;
};

export type SyncBlobCryptoContext = {
  blobId: string;
};

export interface SyncCryptoContext {
  encryptMetadata(
    metadata: SyncedEntryMetadata,
    context: SyncMetadataCryptoContext,
  ): Promise<string>;
  decryptMetadata(
    encryptedMetadata: string,
    context: SyncMetadataCryptoContext,
  ): Promise<SyncedEntryMetadata>;
  encryptBlob(
    plaintext: Uint8Array,
    context: SyncBlobCryptoContext,
  ): Promise<Uint8Array>;
  decryptBlob(
    encryptedBlob: Uint8Array,
    context: SyncBlobCryptoContext,
  ): Promise<Uint8Array>;
  dispose(): void;
}

/**
 * Identity crypto: payloads are stored/transferred as plaintext. The
 * `remoteVaultKey` is accepted for call-site compatibility but ignored.
 *
 * The server treats `encrypted_metadata` and R2 blobs as opaque bytes, so this
 * requires no coordinator / blob-transfer changes.
 */
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

/** Identity crypto stores bytes as-is, so encrypted size === plaintext size. */
export function encryptedSyncBlobSize(plaintextBytes: number): number {
  return plaintextBytes;
}

class IdentitySyncCryptoContext implements SyncCryptoContext {
  async encryptMetadata(
    metadata: SyncedEntryMetadata,
    _context: SyncMetadataCryptoContext,
  ): Promise<string> {
    return serializeSyncedEntryMetadata(metadata);
  }

  async decryptMetadata(
    encryptedMetadata: string,
    _context: SyncMetadataCryptoContext,
  ): Promise<SyncedEntryMetadata> {
    return parseSyncedEntryMetadata(encryptedMetadata);
  }

  async encryptBlob(
    plaintext: Uint8Array,
    _context: SyncBlobCryptoContext,
  ): Promise<Uint8Array> {
    return plaintext;
  }

  async decryptBlob(
    encryptedBlob: Uint8Array,
    _context: SyncBlobCryptoContext,
  ): Promise<Uint8Array> {
    return encryptedBlob;
  }

  dispose(): void {}
}
