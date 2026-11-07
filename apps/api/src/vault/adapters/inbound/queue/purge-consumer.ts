import type { VaultPurgeMessage } from "../../../application/dto/queue-messages";
import type { PurgeVault } from "../../../application/ports/inbound/purge-vault";

export class VaultPurgeConsumer {
	constructor(private readonly purgeVaultService: PurgeVault) {}

	async purgeVault(vaultId: string): Promise<void> {
		await this.purgeVaultService.purgeVault(vaultId);
	}

	async handleMessage(message: Message<VaultPurgeMessage>): Promise<void> {
		const body = message.body;
		if (body?.type !== "vault_purge" || !body.vaultId.trim()) {
			message.ack();
			return;
		}

		try {
			await this.purgeVault(body.vaultId);
			message.ack();
		} catch {
			message.retry();
		}
	}

	async handleBatch(batch: MessageBatch<VaultPurgeMessage>): Promise<void> {
		for (const message of batch.messages) {
			await this.handleMessage(message);
		}
	}
}
