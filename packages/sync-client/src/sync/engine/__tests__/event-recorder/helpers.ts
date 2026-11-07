
import { parseSyncedEntryMetadata, serializeSyncedEntryMetadata } from "../../../core/content";
import type { SyncStore } from "../../../store/store";


export async function decryptPendingMetadata(
  pending:
    | {
        entryId: string;
        baseRevision: number;
        op: "upsert" | "delete";
        blobId: string | null;
        encryptedMetadata: string;
      }
    | null
    | undefined,
) {
  if (!pending) {
    throw new Error("missing pending mutation");
  }

  return parseSyncedEntryMetadata(pending.encryptedMetadata);
}

export async function encryptTestMetadata(input: {
  entryId: string;
  revision: number;
  op: "upsert" | "delete";
  blobId: string | null;
  path: string;
  hash?: string;
}) {
  const hash = input.op === "delete" ? null : requireHash(input.hash);
  return serializeSyncedEntryMetadata({
    path: input.path,
    hash,
  });
}

export async function putTestBaseBlob(
  store: SyncStore,
  input: {
    blobId: string;
    hash: string;
    bytes?: Uint8Array;
  },
): Promise<void> {
  await store.putBlob({
    blobId: input.blobId,
    hash: input.hash,
    encryptedBytes: input.bytes ?? new Uint8Array(),
    role: "base",
    cachedAt: 1,
  });
}

function requireHash(hash: string | undefined): string {
  if (!hash) {
    throw new Error("test metadata hash is required for upserts");
  }

  return hash;
}
