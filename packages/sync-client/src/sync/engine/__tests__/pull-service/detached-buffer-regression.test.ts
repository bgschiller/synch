import { createTestContentRuntime } from "../../../../test-support/content-runtime";
import { describe, expect, it } from "vitest";

import { SyncPullService } from "../../pull-service";
import { isPortableVaultPath } from "../../../core/portable-path";
import { decryptSyncBlob } from "../../../core/crypto";
import {
  createDefaultContentHasher,
  hashBytes,
  type SyncContentHasher,
} from "../../../core/content";
import { createTestSyncStore } from "../../../../test-support/in-memory-sync-store";
import {
  createBlobClient,
  createCommit,
  createRealtimeSession,
  createToken,
  createVaultAdapter,
  encryptRemoteMetadata,
  encryptTestBlob,
  hashText,
  ignoreProgress,
} from "./helpers";

/**
 * The SHA-256 worker pool transfers (detaches) the caller's buffer and returns
 * a fresh buffer. This hasher mirrors that contract so the regression below
 * fails unless callers stop reusing the pre-hash buffer.
 */
function createTransferringHasher(): SyncContentHasher {
  const base = createDefaultContentHasher();
  return {
    hash: base.hash,
    hashAndReturnBytes: async (bytes) => {
      const transferred = structuredClone(bytes, { transfer: [bytes.buffer] });
      return { hash: await hashBytes(transferred), bytes: transferred };
    },
  };
}

describe("SyncPullService detached ArrayBuffer regression", () => {
  it("caches an auto-merge text blob without constructing a detached ArrayBuffer", async () => {
    const store = createTestSyncStore();
    const adapter = createVaultAdapter();
    const body = "hello from the remote device";
    const blobId = "blob-note";
    const hash = await hashText(body);

    const service = new SyncPullService({
      contentRuntime: createTestContentRuntime({ hasher: createTransferringHasher() }),
      getSyncToken: async () => createToken(),
      getSyncStore: () => store,
      shouldApplyRemotePath: (path, deleted) => deleted || isPortableVaultPath(path),
      vaultAdapter: adapter,
      blobClient: createBlobClient({
        blobs: {
          [blobId]: await encryptTestBlob(blobId, new TextEncoder().encode(body)),
        },
      }),
      onProgress: ignoreProgress,
    });

    await service.pullOnce(createRealtimeSession({
      pages: [{
        cursor: 1,
        hasMore: false,
        commits: [createCommit({
          entryId: "note",
          revision: 1,
          blobId,
          encryptedMetadata: await encryptRemoteMetadata({
            entryId: "note",
            revision: 1,
            blobId,
            path: "Folder/note.md",
            hash,
          }),
        })],
      }],
    }));

    expect(adapter.text("Folder/note.md")).toBe(body);

    // If the cached encryptedBytes were detached, `putBlob` → `toBlobRecord`
    // would already have thrown while constructing the row. Asserting that the
    // cached bytes still decrypt proves the stored buffer is intact.
    const cached = await store.getBlob(blobId);
    expect(cached).not.toBeNull();
    expect(
      new TextDecoder().decode(await decryptSyncBlob(cached!.encryptedBytes, { blobId })),
    ).toBe(body);

    await store.close();
  });
});
