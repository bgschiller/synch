import { describe, expect, it } from "vitest";

import {
  createSyncCryptoContext,
  decryptSyncBlob,
  decryptSyncMetadata,
  encryptedSyncBlobSize,
  encryptSyncBlob,
  encryptSyncMetadata,
} from "./crypto";

const TEST_METADATA_CONTEXT = {
  entryId: "entry-1",
  revision: 1,
  op: "upsert" as const,
  blobId: "blob-1",
};
const TEST_BLOB_CONTEXT = {
  blobId: "blob-1",
};

describe("identity sync crypto", () => {
  it("stores metadata as plaintext JSON (no envelope)", async () => {
    const encrypted = await encryptSyncMetadata(
      { path: "Folder/note.md", hash: "hash-1" },
      TEST_METADATA_CONTEXT,
    );

    expect(encrypted).toBe(JSON.stringify({ path: "Folder/note.md", hash: "hash-1" }));
    expect(encrypted).toContain("Folder/note.md");
  });

  it("round-trips metadata through parse/validate", async () => {
    const encrypted = await encryptSyncMetadata(
      { path: "Folder/note.md", hash: "hash-1" },
      TEST_METADATA_CONTEXT,
    );

    await expect(
      decryptSyncMetadata(encrypted, TEST_METADATA_CONTEXT),
    ).resolves.toEqual({ path: "Folder/note.md", hash: "hash-1" });
  });

  it("round-trips binary blobs without adding an envelope", async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const encrypted = await encryptSyncBlob(plaintext, TEST_BLOB_CONTEXT);

    expect(encrypted).toEqual(plaintext);
    await expect(
      decryptSyncBlob(encrypted, TEST_BLOB_CONTEXT),
    ).resolves.toEqual(plaintext);
  });

  it("reports the plaintext size as the encrypted size", () => {
    expect(encryptedSyncBlobSize(10)).toBe(10);
    expect(encryptedSyncBlobSize(0)).toBe(0);
  });

  it("reuses a vault-scoped crypto context across payload types", async () => {
    const context = createSyncCryptoContext();
    const metadata = await context.encryptMetadata(
      { path: "Folder/context.md", hash: "hash-context" },
      TEST_METADATA_CONTEXT,
    );
    const blob = await context.encryptBlob(new Uint8Array([7, 8, 9]), TEST_BLOB_CONTEXT);

    await expect(context.decryptMetadata(metadata, TEST_METADATA_CONTEXT)).resolves.toEqual({
      path: "Folder/context.md",
      hash: "hash-context",
    });
    await expect(context.decryptBlob(blob, TEST_BLOB_CONTEXT)).resolves.toEqual(
      new Uint8Array([7, 8, 9]),
    );
  });

  it("ignores the vault key (any key decrypts)", async () => {
    const encrypted = await encryptSyncMetadata(
      { path: "Folder/secret.md", hash: "hash-1" },
      TEST_METADATA_CONTEXT,
    );

    await expect(
      decryptSyncMetadata(encrypted, TEST_METADATA_CONTEXT),
    ).resolves.toEqual({ path: "Folder/secret.md", hash: "hash-1" });
  });

  it("ignores the entry/blob context (no AAD binding)", async () => {
    const metadata = await encryptSyncMetadata(
      { path: "Folder/secret.md", hash: "hash-1" },
      TEST_METADATA_CONTEXT,
    );
    const blob = await encryptSyncBlob(
      new Uint8Array([1, 2, 3]),
      TEST_BLOB_CONTEXT,
    );

    await expect(
      decryptSyncMetadata(metadata, {
        ...TEST_METADATA_CONTEXT,
        entryId: "entry-2",
      }),
    ).resolves.toEqual({ path: "Folder/secret.md", hash: "hash-1" });
    await expect(
      decryptSyncBlob(blob, { blobId: "blob-2" }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("treats dispose as a no-op", async () => {
    const context = createSyncCryptoContext();
    context.dispose();

    await expect(
      context.encryptBlob(new Uint8Array([2]), TEST_BLOB_CONTEXT),
    ).resolves.toEqual(new Uint8Array([2]));
    await expect(
      context.decryptMetadata(
        JSON.stringify({ path: "Folder/x.md", hash: "hash-1" }),
        TEST_METADATA_CONTEXT,
      ),
    ).resolves.toEqual({ path: "Folder/x.md", hash: "hash-1" });
  });
});
