import { describe, expect, it } from "vitest";

import {
  createSyncCryptoContext,
  decryptSyncBlob,
  decryptSyncMetadata,
  encryptedSyncBlobSize,
  encryptSyncBlob,
  encryptSyncMetadata,
} from "./crypto";

const TEST_VAULT_KEY = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));
const OTHER_VAULT_KEY = new Uint8Array(Array.from({ length: 32 }, (_, index) => 255 - index));
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
      TEST_VAULT_KEY,
      { path: "Folder/note.md", hash: "hash-1" },
      TEST_METADATA_CONTEXT,
    );

    expect(encrypted).toBe(JSON.stringify({ path: "Folder/note.md", hash: "hash-1" }));
    expect(encrypted).toContain("Folder/note.md");
  });

  it("round-trips metadata through parse/validate", async () => {
    const encrypted = await encryptSyncMetadata(
      TEST_VAULT_KEY,
      { path: "Folder/note.md", hash: "hash-1" },
      TEST_METADATA_CONTEXT,
    );

    await expect(
      decryptSyncMetadata(TEST_VAULT_KEY, encrypted, TEST_METADATA_CONTEXT),
    ).resolves.toEqual({ path: "Folder/note.md", hash: "hash-1" });
  });

  it("round-trips binary blobs without adding an envelope", async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const encrypted = await encryptSyncBlob(TEST_VAULT_KEY, plaintext, TEST_BLOB_CONTEXT);

    expect(encrypted).toEqual(plaintext);
    await expect(
      decryptSyncBlob(TEST_VAULT_KEY, encrypted, TEST_BLOB_CONTEXT),
    ).resolves.toEqual(plaintext);
  });

  it("reports the plaintext size as the encrypted size", () => {
    expect(encryptedSyncBlobSize(10)).toBe(10);
    expect(encryptedSyncBlobSize(0)).toBe(0);
  });

  it("reuses a vault-scoped crypto context across payload types", async () => {
    const context = createSyncCryptoContext(TEST_VAULT_KEY);
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
      TEST_VAULT_KEY,
      { path: "Folder/secret.md", hash: "hash-1" },
      TEST_METADATA_CONTEXT,
    );

    await expect(
      decryptSyncMetadata(OTHER_VAULT_KEY, encrypted, TEST_METADATA_CONTEXT),
    ).resolves.toEqual({ path: "Folder/secret.md", hash: "hash-1" });
  });

  it("ignores the entry/blob context (no AAD binding)", async () => {
    const metadata = await encryptSyncMetadata(
      TEST_VAULT_KEY,
      { path: "Folder/secret.md", hash: "hash-1" },
      TEST_METADATA_CONTEXT,
    );
    const blob = await encryptSyncBlob(
      TEST_VAULT_KEY,
      new Uint8Array([1, 2, 3]),
      TEST_BLOB_CONTEXT,
    );

    await expect(
      decryptSyncMetadata(TEST_VAULT_KEY, metadata, {
        ...TEST_METADATA_CONTEXT,
        entryId: "entry-2",
      }),
    ).resolves.toEqual({ path: "Folder/secret.md", hash: "hash-1" });
    await expect(
      decryptSyncBlob(TEST_VAULT_KEY, blob, { blobId: "blob-2" }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("treats dispose as a no-op", async () => {
    const context = createSyncCryptoContext(TEST_VAULT_KEY);
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
