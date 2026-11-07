import { serializeSyncedEntryMetadata } from "./content";
import type { SyncMutationStore } from "../store/ports";
import type { PendingMutationRow } from "../store/store";

export type PendingMutationWriter = Pick<SyncMutationStore, "replaceDirtyEntry">;

export interface QueueLocalUpsertMutationInput {
  path: string;
  entryId: string;
  base: MutationBase | null | undefined;
  previousLocal?: MutationLocalContent | null | undefined;
  hash: string;
  requireBaseBlob?: boolean;
}

export interface MutationBase {
  revision: number;
  deleted: boolean;
  blobId: string | null;
  hash: string | null;
}

export interface MutationLocalContent {
  deleted: boolean;
  blobId: string | null;
  hash: string | null;
}

export interface QueuedLocalUpsertMutation {
  entryId: string;
  blobId: string;
  mutation: PendingMutationRow;
}

export async function queueLocalUpsertMutation(
  store: PendingMutationWriter,
  input: QueueLocalUpsertMutationInput,
): Promise<QueuedLocalUpsertMutation> {
  const queued = buildLocalUpsertMutation(input);
  await store.replaceDirtyEntry(queued.mutation, {
    requireBaseBlob: input.requireBaseBlob,
  });

  return queued;
}

export type BuildLocalUpsertMutationInput = QueueLocalUpsertMutationInput;

export function buildLocalUpsertMutation(
  input: BuildLocalUpsertMutationInput,
): QueuedLocalUpsertMutation {
  const entryId = input.entryId;
  const baseRevision = input.base?.revision ?? 0;
  const blobId = createNextBlobId(input.previousLocal ?? input.base, input.hash);
  const mutation: PendingMutationRow = {
    mutationId: crypto.randomUUID(),
    entryId,
    op: "upsert",
    baseRevision,
    baseBlobId: input.base?.blobId ?? null,
    baseHash: input.base?.hash ?? null,
    blobId,
    hash: input.hash,
    encryptedMetadata: serializeSyncedEntryMetadata({
      path: input.path,
      hash: input.hash,
    }),
    createdAt: Date.now(),
  };

  return {
    entryId,
    blobId,
    mutation,
  };
}

export interface QueueLocalDeleteMutationInput {
  entryId: string;
  base: MutationBase;
  path: string;
}

export async function queueLocalDeleteMutation(
  store: PendingMutationWriter,
  input: QueueLocalDeleteMutationInput,
): Promise<PendingMutationRow> {
  const mutation = buildLocalDeleteMutation(input);
  await store.replaceDirtyEntry(mutation);
  return mutation;
}

export type BuildLocalDeleteMutationInput = QueueLocalDeleteMutationInput;

export function buildLocalDeleteMutation(
  input: BuildLocalDeleteMutationInput,
): PendingMutationRow {
  return {
    mutationId: crypto.randomUUID(),
    entryId: input.entryId,
    op: "delete",
    baseRevision: input.base.revision,
    baseBlobId: input.base.blobId,
    baseHash: input.base.hash,
    blobId: null,
    hash: null,
    encryptedMetadata: serializeSyncedEntryMetadata({
      path: input.path,
      hash: null,
    }),
    createdAt: Date.now(),
  };
}

export function createNextBlobId(
  entry:
    | {
        deleted: boolean;
        blobId: string | null;
        hash: string | null;
      }
    | null
    | undefined,
  hash: string,
): string {
  if (entry && !entry.deleted && entry.hash === hash && entry.blobId) {
    return entry.blobId;
  }

  return crypto.randomUUID();
}
