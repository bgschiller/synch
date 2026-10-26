import { describe, expect, it, vi } from "vitest";

import { getSubscriptionPlanPolicy } from "../../../subscription/domain/policy";
import type { VaultAuthorizationStore } from "../ports/outbound/vault-authorization-store";
import type { VaultCatalogStore } from "../ports/outbound/vault-catalog-store";
import type { VaultKeyStore } from "../ports/outbound/vault-key-store";
import type { VaultLifecycleStore } from "../ports/outbound/vault-lifecycle-store";
import { VaultApplicationError } from "../errors/vault-errors";
import { VaultApplicationService } from "./vault-service";

function setup(overrides: Record<string, unknown> = {}) {
	const store = {
		readDefaultOrganizationIdForUser: vi.fn(async () => "org-1"),
		countVaultsForOrganization: vi.fn(async () => 0),
		vaultNameExistsForOrganization: vi.fn(async () => false),
		createVaultForUser: vi.fn(async () => ({
			id: "vault-1",
			organizationId: "org-1",
			name: "Personal",
			activeKeyVersion: 1,
			createdAt: new Date("2026-04-22T00:00:00.000Z"),
			deletedAt: null,
			purgeStatus: null,
			purgeError: null,
		})),
		readAccessibleVaultForUser: vi.fn(async () => ({
			id: "vault-1",
			organizationId: "org-1",
			name: "Personal",
			activeKeyVersion: 1,
			createdAt: new Date("2026-04-22T00:00:00.000Z"),
			deletedAt: null,
			purgeStatus: null,
			purgeError: null,
		})),
		moveVaultForUser: vi.fn(async () => ({
			id: "vault-1",
			organizationId: "org-2",
			name: "Personal",
			activeKeyVersion: 1,
			createdAt: new Date("2026-04-22T00:00:00.000Z"),
			deletedAt: null,
			purgeStatus: null,
			purgeError: null,
		})),
		readVaultAuthorizationFacts: vi.fn(async () => ({
			vault: { organizationId: "org-1", deleted: false },
			vaultMembership: { status: "active" },
			organizationRole: "owner",
		})),
		markVaultDeletionQueued: vi.fn(async () => true),
		markVaultDeletionQueueFailed: vi.fn(async () => {}),
		...overrides,
	};
	const policyReader = {
		readOrganizationPolicy: vi.fn(async () => getSubscriptionPlanPolicy("free")),
	};
	const purgeQueue = {
		enqueueVaultPurge: vi.fn(async () => {}),
		enqueueInactiveVaultPurge: vi.fn(async () => {}),
	};
	return {
		store,
		policyReader,
		purgeQueue,
		service: new VaultApplicationService(
			store as unknown as VaultAuthorizationStore,
			store as unknown as VaultCatalogStore,
			store as unknown as VaultKeyStore,
			store as unknown as VaultLifecycleStore,
			policyReader,
			purgeQueue,
		),
	};
}

describe("VaultApplicationService", () => {
	it("passes the vault name through to the mutation store", async () => {
		const { service, store } = setup();

		const created = await service.createVault("user-1", "Personal");

		expect(created.id).toBe("vault-1");
		expect(store.createVaultForUser).toHaveBeenCalledWith(
			"user-1",
			"org-1",
			"Personal",
            1,
		);
	});

	it("returns a typed error when no organization is available", async () => {
		const { service, store } = setup({
			readDefaultOrganizationIdForUser: vi.fn(async () => null),
		});

		await expect(service.createVault("user-1", "Personal")).rejects.toBeInstanceOf(
			VaultApplicationError,
		);
		expect(store.createVaultForUser).not.toHaveBeenCalled();
	});

	it("preserves zero-limit plans as unlimited", async () => {
		const { service, store, policyReader } = setup({
			countVaultsForOrganization: vi.fn(async () => 10),
		});
		policyReader.readOrganizationPolicy.mockResolvedValueOnce(
			getSubscriptionPlanPolicy("self_hosted"),
		);

		await expect(service.createVault("user-1", "Work")).resolves.toMatchObject({
			id: "vault-1",
		});
		expect(store.createVaultForUser).toHaveBeenCalled();
	});

	it("restores a deletion claim when purge enqueue fails", async () => {
		const enqueueError = new Error("queue unavailable");
		const { service, store, purgeQueue } = setup();
		purgeQueue.enqueueVaultPurge.mockRejectedValueOnce(enqueueError);

		await expect(service.deleteVault("user-1", "vault-1")).rejects.toThrow(enqueueError);
		expect(store.markVaultDeletionQueueFailed).toHaveBeenCalledWith(
			"vault-1",
			"queue unavailable",
		);
	});

	it("moves a vault to another organization when the actor manages both", async () => {
		const { service, store } = setup();

		const moved = await service.moveVault("user-1", "vault-1", "org-2");

		expect(moved.organizationId).toBe("org-2");
		expect(store.moveVaultForUser).toHaveBeenCalledWith(
			"user-1",
			"vault-1",
			"org-2",
			1,
		);
	});

	it("rejects moving a vault into the organization it already belongs to", async () => {
		const { service, store } = setup();

		await expect(
			service.moveVault("user-1", "vault-1", "org-1"),
		).rejects.toMatchObject({ code: "vault_already_in_organization" });
		expect(store.moveVaultForUser).not.toHaveBeenCalled();
	});

	it("rejects a move without manage access to the source organization", async () => {
		const { service, store } = setup({
			readVaultAuthorizationFacts: vi.fn(async () => ({
				vault: { organizationId: "org-1", deleted: false },
				vaultMembership: { status: "active" },
				organizationRole: "member",
			})),
		});

		await expect(
			service.moveVault("user-1", "vault-1", "org-2"),
		).rejects.toMatchObject({ code: "forbidden" });
		expect(store.moveVaultForUser).not.toHaveBeenCalled();
	});

	it("rejects a move when the destination already has a vault with that name", async () => {
		const { service, store } = setup({
			vaultNameExistsForOrganization: vi.fn(async () => true),
		});

		await expect(
			service.moveVault("user-1", "vault-1", "org-2"),
		).rejects.toMatchObject({ code: "vault_name_exists" });
		expect(store.moveVaultForUser).not.toHaveBeenCalled();
	});
});
