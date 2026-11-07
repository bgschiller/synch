import {
	SYNC_WEBSOCKET_PROTOCOL,
	SYNC_WEBSOCKET_AUTH_PROTOCOL_PREFIX,
} from "../../src/sync-access/application";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
	apiRequest,
	jsonRequest,
	signUpAccount,
	signUpAndCreateVault,
	issueSyncToken,
} from "../helpers/api";

const mutation = (cookie: string, body?: unknown, method = "POST") => ({
	method,
	headers: { cookie, "content-type": "application/json" },
	...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

describe("organization sharing on Cloudflare", () => {
	it("lets a user create additional organizations", async () => {
		const owner = await signUpAndCreateVault();
		const created = await jsonRequest<{ organization: { id: string; name: string; role: string } }>(
			"/v1/organizations",
			mutation(owner.sessionCookie, { name: "Household" }),
		);
		expect(created.response.status).toBe(201);
		expect(created.json!.organization).toEqual(expect.objectContaining({ name: "Household", role: "owner" }));
		const list = await jsonRequest<{ organizations: { id: string; name: string }[] }>(
			"/v1/organizations",
			{ headers: { cookie: owner.sessionCookie } },
		);
		expect(list.json!.organizations).toHaveLength(2);
		expect(list.json!.organizations.map((org) => org.name)).toEqual(expect.arrayContaining(["Household"]));
	});
	it("uses organization roles for all vault management and preserves content access on demotion", async () => {
		const owner = await signUpAndCreateVault();
		const admin = await signUpAccount();
		const invite = await jsonRequest<{ id: string }>(`/v1/organizations/${owner.organizationId}/invitations`, mutation(owner.sessionCookie, {
			email: admin.email, role: "admin",
		}));
		expect(invite.response.status).toBe(201);
		expect((await jsonRequest(`/v1/invitations/${invite.json!.id}/accept`, mutation(admin.sessionCookie))).response.status).toBe(200);
		const organization = await jsonRequest<{ vaults: { id: string; canManage: boolean; status: string }[] }>(`/v1/organizations/${owner.organizationId}`, { headers: { cookie: admin.sessionCookie } });
		expect(organization.json!.vaults).toEqual([expect.objectContaining({ id: owner.vaultId, canManage: true, status: "active" })]);
		const created = await jsonRequest<{ vault: { id: string } }>("/v1/vaults", mutation(admin.sessionCookie, {
			name: "Created by admin", organizationId: owner.organizationId,
		}));
		expect(created.response.status).toBe(201);
		// The owner can delete a vault created by someone else.
		expect((await jsonRequest(`/v1/vaults/${created.json!.vault.id}`, mutation(owner.sessionCookie, undefined, "DELETE"))).response.status).toBe(202);
		// Auto-enrollment grants the admin access without a key ceremony.
		const token = await issueSyncToken(admin.sessionCookie, owner.vaultId, "admin-device");
		expect((await jsonRequest(`/v1/organizations/${owner.organizationId}/members/${admin.userId}`, mutation(owner.sessionCookie, { role: "member" }, "PATCH"))).response.status).toBe(200);
		expect((await jsonRequest(`/v1/vaults/${owner.vaultId}/bootstrap`, { headers: { cookie: admin.sessionCookie } })).response.status).toBe(200);
		expect((await apiRequest(`/v1/vaults/${owner.vaultId}/blobs/denied`, { headers: { authorization: `Bearer ${token.token}` } })).status).toBe(404);
		expect((await jsonRequest(`/v1/vaults/${owner.vaultId}`, mutation(admin.sessionCookie, undefined, "DELETE"))).response.status).toBe(403);
	});

	it("revokes existing tokens and sockets, then allows sync after access is granted again", async () => {
		const owner = await signUpAndCreateVault();
		const member = await signUpAccount();
		const invites = `/v1/organizations/${owner.organizationId}/invitations`;
		const input = {
			email: member.email,
			role: "member",
		};
		// A stale invitation form must not silently broaden a selected-vault invite.
		expect((await jsonRequest(invites, mutation(owner.sessionCookie, {
			...input, vaults: [{ vaultId: owner.vaultId }],
		}))).response.status).toBe(400);
		expect((await jsonRequest(invites, mutation(owner.sessionCookie, {
			...input, vaults: [{ vaultId: owner.vaultId, role: "admin" }],
		}))).response.status).toBe(400);
		expect(
			(
				await apiRequest(invites, {
					...mutation(owner.sessionCookie, input),
					headers: {
						...mutation(owner.sessionCookie).headers,
						origin: "https://untrusted.example",
					},
				})
			).status,
		).toBe(403);
		const invited = await jsonRequest<{ id: string }>(
			invites,
			mutation(owner.sessionCookie, input),
		);
		expect(invited.response.status).toBe(201);
		const inviteId = invited.json!.id;
		expect(
			(
				await jsonRequest(
					`/v1/invitations/${inviteId}/accept`,
					mutation(owner.sessionCookie),
				)
			).response.status,
		).toBe(403);
		expect(
			(
				await jsonRequest(
					`/v1/invitations/${inviteId}/accept`,
					mutation(member.sessionCookie),
				)
			).response.status,
		).toBe(200);
		// Accepting auto-enrolls the member into every org vault; no key-request
		// ceremony is required before syncing.
		expect(
			(
				await jsonRequest(`/v1/vaults/${owner.vaultId}/bootstrap`, {
					headers: { cookie: member.sessionCookie },
				})
			).response.status,
		).toBe(200);
		const issued = await issueSyncToken(
			member.sessionCookie,
			owner.vaultId,
			"member-device",
		);
		const connected = await apiRequest(`/v1/vaults/${owner.vaultId}/socket`, {
			headers: {
				Upgrade: "websocket",
				"Sec-WebSocket-Protocol": `${SYNC_WEBSOCKET_PROTOCOL}, ${SYNC_WEBSOCKET_AUTH_PROTOCOL_PREFIX}${issued.token}`,
			},
		});
		expect(connected.status).toBe(101);
		const socket = connected.webSocket!;
		socket.accept();
		const ownerToken = await issueSyncToken(owner.sessionCookie, owner.vaultId, "owner-device");
		const ownerConnection = await apiRequest(`/v1/vaults/${owner.vaultId}/socket`, {
			headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `${SYNC_WEBSOCKET_PROTOCOL}, ${SYNC_WEBSOCKET_AUTH_PROTOCOL_PREFIX}${ownerToken.token}` },
		});
		expect(ownerConnection.status).toBe(101);
		const ownerSocket = ownerConnection.webSocket!;
		ownerSocket.accept();
		// Every member with active vault access can edit encrypted content.
		expect((await apiRequest(`/v1/vaults/${owner.vaultId}/blobs/member-edit`, {
			method: "PUT", headers: { authorization: `Bearer ${issued.token}`, "x-blob-size": "17" }, body: "member ciphertext",
		})).status).toBe(201);
		expect((await jsonRequest(`/v1/vaults/${owner.vaultId}`, mutation(member.sessionCookie, undefined, "DELETE"))).response.status).toBe(403);
		for (const path of ["grants", "members"]) {
			expect((await jsonRequest(`/v1/vaults/${owner.vaultId}/${path}`, mutation(owner.sessionCookie, { userId: member.userId }))).response.status).toBe(410);
		}
		expect((await jsonRequest(`/v1/vaults/${owner.vaultId}/members/${member.userId}`, mutation(owner.sessionCookie, undefined, "DELETE"))).response.status).toBe(410);
		expect((await jsonRequest(`/v1/vaults/${owner.vaultId}/bootstrap`, { headers: { cookie: member.sessionCookie } })).response.status).toBe(200);
		expect((await jsonRequest("/v1/vaults", mutation(member.sessionCookie, { name: "Member cannot create", organizationId: owner.organizationId }))).response.status).toBe(403);
		const closed = new Promise<number>((resolve) =>
			socket.addEventListener("close", (event) => resolve(event.code)),
		);
		expect(
			(
				await jsonRequest(
					`/v1/organizations/${owner.organizationId}/members/${member.userId}`,
					mutation(owner.sessionCookie, undefined, "DELETE"),
				)
			).response.status,
		).toBe(200);
		expect(await closed).toBe(1012);
		const ownerReply = new Promise<unknown>((resolve) => ownerSocket.addEventListener("message", (event) => resolve(JSON.parse(String(event.data))), { once: true }));
		ownerSocket.send(JSON.stringify({ type: "heartbeat", requestId: "owner-still-connected" }));
		expect(await ownerReply).toMatchObject({ type: "heartbeat_ack", requestId: "owner-still-connected" });
		ownerSocket.close();
		const revocations = await runInDurableObject(env.SYNC_COORDINATOR.getByName(owner.vaultId), async (_, state) =>
			state.storage.sql.exec("SELECT key, minimum_version FROM sync_access_revocations").toArray(),
		);
		expect(revocations).toContainEqual({ key: `user:${member.userId}`, minimum_version: 2 });
		expect(
			(
				await apiRequest(`/v1/vaults/${owner.vaultId}/blobs/old-blob`, {
					headers: { authorization: `Bearer ${issued.token}` },
				})
			).status,
		).toBe(403);
		expect(
			(
				await jsonRequest(
					"/v1/sync/token",
					mutation(member.sessionCookie, {
						vaultId: owner.vaultId,
						localVaultId: "member-device",
					}),
				)
			).response.status,
		).toBe(403);
		expect(
			(
				await jsonRequest(
					`/v1/invitations/${inviteId}/accept`,
					mutation(member.sessionCookie),
				)
			).response.status,
		).toBe(200);
		expect(
			(
				await jsonRequest(`/v1/vaults/${owner.vaultId}/bootstrap`, {
					headers: { cookie: member.sessionCookie },
				})
			).response.status,
		).toBe(403);

		// Rejoining requires a new invitation and a fresh token.
		const reinvited = await jsonRequest<{ id: string }>(invites, mutation(owner.sessionCookie, input));
		expect(reinvited.response.status).toBe(201);
		expect((await jsonRequest(`/v1/invitations/${reinvited.json!.id}/accept`, mutation(member.sessionCookie))).response.status).toBe(200);
		const membership = await env.DB.prepare("SELECT access_version FROM vault_membership WHERE vault_id=? AND user_id=?")
			.bind(owner.vaultId, member.userId).first<{ access_version: number }>();
		expect(membership?.access_version).toBe(2);
		expect((await apiRequest(`/v1/vaults/${owner.vaultId}/socket`, {
			headers: {
				Upgrade: "websocket",
				"Sec-WebSocket-Protocol": `${SYNC_WEBSOCKET_PROTOCOL}, ${SYNC_WEBSOCKET_AUTH_PROTOCOL_PREFIX}${issued.token}`,
			},
		})).status).toBe(403);
		const renewed = await issueSyncToken(member.sessionCookie, owner.vaultId, "member-device");
		const reconnected = await apiRequest(`/v1/vaults/${owner.vaultId}/socket`, {
			headers: {
				Upgrade: "websocket",
				"Sec-WebSocket-Protocol": `${SYNC_WEBSOCKET_PROTOCOL}, ${SYNC_WEBSOCKET_AUTH_PROTOCOL_PREFIX}${renewed.token}`,
			},
		});
		expect(reconnected.status).toBe(101);
		const renewedSocket = reconnected.webSocket!;
		renewedSocket.accept();
		try {
			const reply = new Promise<unknown>((resolve) =>
				renewedSocket.addEventListener("message", (event) => resolve(JSON.parse(String(event.data))), { once: true }),
			);
			renewedSocket.send(JSON.stringify({ type: "hello", requestId: "renewed-hello", lastKnownCursor: 0 }));
			expect(await reply).toMatchObject({ type: "hello_ack", requestId: "renewed-hello" });
		} finally {
			renewedSocket.close();
		}
	});
});
