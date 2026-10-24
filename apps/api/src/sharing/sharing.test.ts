import { DrizzleVaultStore } from "../vault/adapters/outbound/drizzle-vault-store";
import { afterEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { createLibsqlDb } from "../db/client";
import * as s from "../db/d1";
import { DrizzleSharingStore } from "./adapters/drizzle-sharing-store";
import { SharingService } from "./application/service";
import { SharingAccess } from "./application/access";
import { getSubscriptionPlanPolicy } from "../subscription/domain/policy";

const clients: Client[] = [];
afterEach(() => {
	clients.splice(0).forEach((c) => c.close());
});
async function setup() {
	const client = createClient({ url: ":memory:" });
	clients.push(client);
	await migrate(drizzle(client), {
		migrationsFolder: fileURLToPath(
			new URL("../../drizzle", import.meta.url).href,
		),
	});
	const db = createLibsqlDb(client);
	const store = new DrizzleSharingStore(db);
	for (const id of ["owner", "alice", "bob", "carol"])
		await db.insert(s.user).values({
			id,
			name: id,
			email: `${id}@example.com`,
			emailVerified: true,
		});
	await db
		.insert(s.organization)
		.values({ id: "org", name: "Team", slug: "team", createdAt: new Date() });
	await db.insert(s.member).values({
		id: "owner-membership",
		userId: "owner",
		organizationId: "org",
		role: "owner",
		createdAt: new Date(),
	});
	for (const id of ["vault-a", "vault-b"]) {
		await db
			.insert(s.vault)
			.values({ id, organizationId: "org", name: id, activeKeyVersion: 1 });
		await db.insert(s.vaultMembership).values({
			vaultId: id,
			userId: "owner",
			isCreator: true,
			status: "active",
		});
	}
	let plan: "plus" | "free" = "plus";
	const policy = {
		readOrganizationPolicy: async () => getSubscriptionPlanPolicy(plan),
	};
	const service = new SharingService(
		store,
		policy,
		{ refreshSharingAccess: async () => {} },
		{ baseURL: "https://example.com", requireVerifiedEmail: true },
	);
	return {
		db,
		store,
		service,
		access: new SharingAccess(store, policy),
		setPlan: (p: typeof plan) => {
			plan = p;
		},
	};
}
const actor = (id: string) => ({ id, email: `${id}@example.com` });

describe("organization vault sharing", () => {
	it.each(["admin", "member"] as const)("auto-enrolls %s in every current and future vault", async (role) => {
		const { service, db, access } = await setup();
		const invite = await service.invite(actor("owner"), "org", { email: actor("alice").email, role });
		await service.resend("owner", "org", invite.id);
		expect((await service.invitation(actor("alice"), invite.id)).vaults).toHaveLength(2);
		await service.respond(actor("alice"), invite.id, true);
		const vaultStore = new DrizzleVaultStore(db);
		const created = await vaultStore.createVaultForUser("owner", "org", "Later");
		const org = await service.organization("alice", "org");
		expect(org.vaults).toHaveLength(3);
		expect(org.vaults.every((v) => v.canManage === (role === "admin") && v.status === "active" && !v.personal && v.shared)).toBe(true);
		expect((await vaultStore.listVaultsForUser("alice")).map((v) => v.id)).toContain(created.id);
		expect(await access.require("alice", "vault-a")).toBe(1);
		expect(await vaultStore.readVaultBootstrapForUser("alice", "vault-a")).not.toBeNull();
		expect(await access.require("alice", created.id)).toBe(1);
	});

	it("keeps access across role changes while removing management authority", async () => {
		const { service, access } = await setup();
		const invite = await service.invite(actor("owner"), "org", { email: actor("alice").email, role: "admin" });
		await service.respond(actor("alice"), invite.id, true);
		expect(await access.require("alice", "vault-a")).toBe(1);
		await service.changeMember("owner", "org", "alice", "member");
		expect(await access.require("alice", "vault-a")).toBe(1);
		await expect(service.invite(actor("alice"), "org", { email: actor("carol").email, role: "member" })).rejects.toMatchObject({ code: "forbidden" });
		await service.changeMember("owner", "org", "alice", "admin");
		expect(await access.require("alice", "vault-a")).toBe(1);
	});

	it("reserves three seats including the owner without requiring any vaults", async () => {
		const { service, store, db } = await setup();
		await db.delete(s.vault);
		const a = await service.invite(actor("owner"), "org", { email: actor("alice").email, role: "member" });
		await service.invite(actor("owner"), "org", { email: actor("bob").email, role: "member" });
		await expect(service.invite(actor("owner"), "org", { email: actor("carol").email, role: "member" })).rejects.toMatchObject({ code: "invitation_conflict" });
		await service.resend("owner", "org", a.id);
		await service.respond(actor("alice"), a.id, true);
		expect(await store.membership("org", "alice")).not.toBeNull();
		expect((await service.organization("alice", "org")).vaults).toEqual([]);
	});

	it("rejects privilege escalation, wrong recipients, foreign vaults and expired invitations", async () => {
		const { service, db, store, access, setPlan } = await setup();
		await db.insert(s.member).values({
			id: "alice-org",
			organizationId: "org",
			userId: "alice",
			role: "admin",
			createdAt: new Date(),
		});
		await db.insert(s.vaultMembership).values({
			vaultId: "vault-a",
			userId: "alice",
			isCreator: false,
			status: "active",
		});
		await expect(
			service.invite(actor("alice"), "org", {
				email: actor("bob").email,
				role: "admin",
			}),
		).rejects.toMatchObject({ code: "forbidden" });
		await expect(
			service.changeMember("alice", "org", "owner"),
		).rejects.toMatchObject({ code: "owner_protected" });
		await db
			.insert(s.organization)
			.values({
				id: "other-org",
				name: "Other",
				slug: "other",
				createdAt: new Date(),
			});
		await db
			.insert(s.member)
			.values({
				id: "other-owner",
				organizationId: "other-org",
				userId: "owner",
				role: "owner",
				createdAt: new Date(),
			});
		await db
			.insert(s.vault)
			.values({
				id: "foreign-vault",
				organizationId: "other-org",
				name: "Foreign",
				activeKeyVersion: 1,
			});
		await db
			.insert(s.vaultMembership)
			.values({
				vaultId: "foreign-vault",
				userId: "owner",
				isCreator: true,
				status: "active",
			});
		await expect(access.require("alice", "foreign-vault")).rejects.toMatchObject({ code: "vault_access_denied" });
		const invite = await service.invite(actor("owner"), "org", {
			email: actor("bob").email,
			role: "member",
		});
		await expect(
			service.respond(actor("carol"), invite.id, true),
		).rejects.toMatchObject({ code: "forbidden" });
		setPlan("free");
		await expect(
			service.respond(actor("bob"), invite.id, true),
		).rejects.toMatchObject({ code: "sharing_unavailable" });
		setPlan("plus");
		await db
			.update(s.invitation)
			.set({ expiresAt: new Date(0) })
			.where(eq(s.invitation.id, invite.id));
		await expect(
			service.respond(actor("bob"), invite.id, true),
		).rejects.toMatchObject({ code: "invitation_unavailable" });
		expect(await store.membership("org", "bob")).toBeNull();
	});

	it("reserves seats and vault quota atomically under concurrent requests", async () => {
		const { service, db, store } = await setup();
		const invites = await Promise.allSettled(
			["alice", "bob", "carol"].map((id) =>
				service.invite(actor("owner"), "org", {
					email: actor(id).email,
					role: "member",
				}),
			),
		);
		expect(
			invites.filter((value) => value.status === "fulfilled"),
		).toHaveLength(2);
		for (const result of invites)
			if (result.status === "fulfilled") {
				const invite = await store.invitation(result.value.id);
				const id = invite!.email.split("@")[0];
				await Promise.allSettled([
					service.respond(actor(id), invite!.id, true),
					service.respond(actor(id), invite!.id, true),
				]);
			}
		expect(await store.members("org")).toHaveLength(3);
		const vaultStore = new DrizzleVaultStore(db);
		const vaults = await Promise.allSettled(
			[0, 1, 2, 3].map((i) =>
				vaultStore.createVaultForUser(
					"owner",
					"org",
					`concurrent-${i}`,
					3,
				),
			),
		);
		expect(vaults.filter((value) => value.status === "fulfilled")).toHaveLength(
			1,
		);
		expect(await vaultStore.countVaultsForOrganization("org")).toBe(3);
	});

	it("retains failed refresh delivery", async () => {
		const { service, store } = await setup();
		const invite = await service.invite(actor("owner"), "org", {
			email: actor("alice").email,
			role: "member",
		});
		await service.respond(actor("alice"), invite.id, true);
		const failing = new SharingService(
			store,
			{ readOrganizationPolicy: async () => getSubscriptionPlanPolicy("plus") },
			{
				refreshSharingAccess: async () => {
					throw new Error("unavailable");
				},
			},
			{ baseURL: "https://example.com", requireVerifiedEmail: true },
		);
		expect(
			await failing.changeMember("owner", "org", "alice"),
		).toEqual({ pending: true });
		expect((await store.refreshes()).length).toBeGreaterThan(0);
		expect(await service.flushRefreshes()).toBe(true);
		expect(await store.refreshes()).toHaveLength(0);
	});

	it("revokes access on removal and restores it on re-invite", async () => {
		const { service, access } = await setup();
		const invite = await service.invite(actor("owner"), "org", { email: actor("alice").email, role: "member" });
		await service.respond(actor("alice"), invite.id, true);
		expect(await access.require("alice", "vault-a")).toBe(1);
		await service.changeMember("owner", "org", "alice");
		await expect(access.require("alice", "vault-a")).rejects.toMatchObject({
			code: "vault_access_denied",
		});
		const reinvite = await service.invite(actor("owner"), "org", { email: actor("alice").email, role: "member" });
		await service.respond(actor("alice"), reinvite.id, true);
		// Removal bumps the access version (a tombstone that invalidates any
		// outstanding sync token); re-enrollment restores access without
		// rolling it back.
		expect(await access.require("alice", "vault-a")).toBe(2);
	});

	it("suspends shared vaults when Plus expires and resumes after renewal", async () => {
		const { service, access, setPlan } = await setup();
		const invite = await service.invite(actor("owner"), "org", { email: actor("alice").email, role: "member" });
		await service.respond(actor("alice"), invite.id, true);
		setPlan("free");
		await expect(access.require("owner", "vault-a")).rejects.toMatchObject({
			code: "sharing_suspended",
		});
		await expect(access.require("owner", "vault-b")).rejects.toMatchObject({ code: "sharing_suspended" });
		expect((await service.organization("alice", "org")).vaults.every(v => v.status === "active")).toBe(true);
		setPlan("plus");
		expect(await access.require("owner", "vault-a")).toBe(1);
	});
});
