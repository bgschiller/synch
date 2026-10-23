import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { SessionReader } from "../../auth/session";
import { createEnsureAuthenticatedSession } from "../../platform/http/authenticated-session";
import type { SharingService } from "../application/service";
import { SharingError } from "../application/types";

const id = z.uuid();
const role = z.enum(["admin", "member"]);

export function registerSharingRoutes(
	app: Hono,
	deps: {
		sharing: SharingService;
		sessionReader: SessionReader;
		trustedOrigins: string[];
	},
) {
	const signedIn = createEnsureAuthenticatedSession(deps.sessionReader);
	const sharingPath = (path: string) =>
		/^\/v1\/(organizations|invitations)(\/|$)/.test(path) ||
		/^\/v1\/vaults\/[^/]+\/(grants|members)(\/|$)/.test(path);
	const api = new Hono<{
		Variables: { user: import("../../auth/session").AuthenticatedUser };
	}>();
	api.use(async (c, next) => {
		if (sharingPath(c.req.path)) return signedIn(c, next);
		await next();
	});
	api.use("*", async (c, next) => {
		const writesUserData =
			sharingPath(c.req.path) ||
			/^\/v1\/(vaults(?:\/[^/]+(?:\/password-wrapper)?)?|billing(?:\/[^/]+)?)$/.test(
				c.req.path,
			);
		if (
			writesUserData &&
			!["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
			!c.req.header("authorization")?.startsWith("Bearer ")
		) {
			const origin = c.req.header("origin");
			if (!origin || !deps.trustedOrigins.includes(origin))
				throw new SharingError(
					403,
					"invalid_origin",
					"Request origin is not trusted",
				);
		}
		await next();
	});
	const service = deps.sharing;
	api.get("/organizations", async (c) =>
		c.json({ organizations: await service.listOrganizations(c.var.user.id) }),
	);
	api.get("/organizations/:orgId", async (c) =>
		c.json(await service.organization(c.var.user.id, c.req.param("orgId"))),
	);
	api.patch(
		"/organizations/:orgId",
		zValidator(
			"json",
			z.object({ name: z.string().trim().min(1).max(100) }).strict(),
		),
		async (c) => {
			await service.rename(
				c.var.user.id,
				c.req.param("orgId"),
				c.req.valid("json").name,
			);
			return c.json({ ok: true });
		},
	);
	api.get("/organizations/:orgId/members", async (c) =>
		c.json({
			members: (await service.organization(c.var.user.id, c.req.param("orgId")))
				.members,
		}),
	);
	api.post(
		"/organizations/:orgId/invitations",
		zValidator(
			"json",
			z
				.object({
					email: z.email(),
					role: role.default("member"),
					vaults: z
						.array(z.object({ vaultId: id }).strict())
						.max(0, "All organization vaults are included; remove the vault selection").optional(),
				})
				.strict(),
		),
		async (c) =>
			c.json(
				await service.invite(
					c.var.user,
					c.req.param("orgId"),
					c.req.valid("json"),
				),
				201,
			),
	);
	api.get("/organizations/:orgId/invitations", async (c) =>
		c.json({
			invitations: (
				await service.organization(c.var.user.id, c.req.param("orgId"))
			).invitations,
		}),
	);
	api.post("/organizations/:orgId/invitations/:id/resend", async (c) =>
		c.json(
			await service.resend(
				c.var.user.id,
				c.req.param("orgId"),
				c.req.param("id"),
			),
		),
	);
	api.post("/organizations/:orgId/invitations/:id/cancel", async (c) => {
		await service.cancel(
			c.var.user.id,
			c.req.param("orgId"),
			c.req.param("id"),
		);
		return c.json({ ok: true });
	});
	api.get("/invitations/:id", async (c) =>
		c.json(await service.invitation(c.var.user, c.req.param("id"))),
	);
	api.post("/invitations/:id/accept", async (c) =>
		c.json(await service.respond(c.var.user, c.req.param("id"), true)),
	);
	api.post("/invitations/:id/reject", async (c) =>
		c.json(await service.respond(c.var.user, c.req.param("id"), false)),
	);
	api.patch(
		"/organizations/:orgId/members/:userId",
		zValidator("json", z.object({ role }).strict()),
		async (c) =>
			c.json(
				await service.changeMember(
					c.var.user.id,
					c.req.param("orgId"),
					c.req.param("userId"),
					c.req.valid("json").role,
				),
			),
	);
	api.delete("/organizations/:orgId/members/:userId", async (c) =>
		c.json(
			await service.changeMember(
				c.var.user.id,
				c.req.param("orgId"),
				c.req.param("userId"),
			),
		),
	);
	// Keep old clients from treating removed per-vault controls as successful writes.
	for (const path of ["/vaults/:vaultId/members", "/vaults/:vaultId/grants"]) {
		api.post(path, (c) => c.json({
			error: "organization_access_inherited",
			message: "All organization members have vault access. Manage organization membership instead.",
		}, 410));
	}
	api.delete("/vaults/:vaultId/members/:userId", (c) => c.json({
		error: "organization_access_inherited",
		message: "Vault access is inherited. Remove the member from the organization to revoke access.",
	}, 410));
	app.route("/v1", api);
}
