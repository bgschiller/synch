import type { CliAppContext } from "../app/context";
import { CliUsageError } from "../app/context";

export async function runVaultConnect(
  ctx: CliAppContext,
  vaultId: string | undefined,
): Promise<number> {
  if (!vaultId?.trim()) {
    throw new CliUsageError(
      "Missing --vault-id. Usage: synch vault connect --vault-id <id> [--vault <path>]",
    );
  }

  await ctx.initializeAuth();
  ctx.requireVerifiedAuth();

  await ctx.remoteVaultManager.bootstrapRemoteVault({
    vaultId: vaultId.trim(),
  });

  // Bind the local sync store to the connected remote vault.
  await ctx.openVaultSession();
  ctx.logger.log(`Vault directory: ${ctx.vaultPath}`);
  ctx.logger.log("Run `synch sync` to synchronize, or `synch watch` to keep syncing.");
  return 0;
}
