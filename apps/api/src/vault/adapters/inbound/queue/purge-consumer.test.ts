import { describe, expect, it, vi } from "vitest";

import { VaultPurgeConsumer } from "./purge-consumer";

describe("VaultPurgeConsumer", () => {
	it("acks after purge", async () => {
		const purgeVault = vi.fn(async () => {});
		const message = {
			body: {
				type: "vault_purge" as const,
				vaultId: "vault-1",
			},
			ack: vi.fn(),
			retry: vi.fn(),
		};
		const consumer = new VaultPurgeConsumer({ purgeVault });

		await consumer.handleMessage(message as never);

		expect(purgeVault).toHaveBeenCalledWith("vault-1");
		expect(message.ack).toHaveBeenCalledOnce();
	});

	it("retries when the purge fails", async () => {
		const message = {
			body: { type: "vault_purge", vaultId: "vault-1" },
			ack: vi.fn(),
			retry: vi.fn(),
		};
		const consumer = new VaultPurgeConsumer({
			purgeVault: vi.fn(async () => {
				throw new Error("coordinator unavailable");
			}),
		});

		await consumer.handleMessage(message as never);

		expect(message.retry).toHaveBeenCalledOnce();
		expect(message.ack).not.toHaveBeenCalled();
	});

	it("acks malformed messages without invoking the use case", async () => {
		const purgeVault = vi.fn(async () => {});
		const message = { body: { type: "unknown" }, ack: vi.fn(), retry: vi.fn() };

		await new VaultPurgeConsumer({ purgeVault }).handleMessage(message as never);

		expect(purgeVault).not.toHaveBeenCalled();
		expect(message.ack).toHaveBeenCalledOnce();
	});
});
