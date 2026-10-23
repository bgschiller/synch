import { SharingClient } from "./client";

/**
 * Holds the authenticated organization context for vault sharing. Key transfer
 * was removed: vault access follows organization membership directly, so this
 * no longer manages key receivers or requests.
 */
export class SharingManager {
  constructor(
    readonly client: SharingClient,
    readonly userId: string,
  ) {}
}
