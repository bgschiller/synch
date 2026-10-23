import { vaultEnrollmentStatus } from "../../vault/domain/policy";
import type { EmailSender } from "../../auth/better-auth";
import type { SubscriptionPolicyReader } from "../../subscription/application";
import { organizationSharingPolicy } from "../../subscription/domain/policy";
import type { SharingStore } from "./store";
import { flushSharingRefreshes, type SharingInvalidator } from "./refresh";
export type { SharingInvalidator } from "./refresh";
import {
	SharingError,
	type SharingActor,
} from "./types";

export type SharingConfig = {
	baseURL: string;
	billingBaseURL?: string;
	requireVerifiedEmail: boolean;
	email?: EmailSender;
	emailFrom?: string;
	allowedEmails?: string;
};

export class SharingService {
	constructor(
		private readonly store: SharingStore,
		private readonly policy: SubscriptionPolicyReader,
		private readonly invalidator: SharingInvalidator,
		private readonly config: SharingConfig,
	) {}

	async listOrganizations(userId: string) {
		return Promise.all(
			(await this.store.organizations(userId)).map(async (org) => ({
				...org,
				plan: await this.policy.readOrganizationPolicy(org.id),
			})),
		);
	}
	async requireOrganization(
		userId: string,
		organizationId: string,
		manage = false,
	) {
		const member = await this.store.membership(organizationId, userId);
		if (!member || (manage && !isManager(member.role))) forbidden();
		return member;
	}
	async requireVault(
		userId: string,
		vaultId: string,
		manage = false,
		pending = false,
	) {
		const vault = await this.store.vault(vaultId);
		if (!vault) throw new SharingError(404, "not_found", "Vault not found");
		const member = await this.requireOrganization(userId, vault.organizationId, manage);
		const storedGrant = await this.store.grant(vaultId, userId);
		const grant = {
			userId,
			isCreator: storedGrant?.isCreator ?? false,
			status: vaultEnrollmentStatus(storedGrant),
			accessVersion: storedGrant?.accessVersion ?? 0,
		};
		if (grant.status !== "active" && !(pending && grant.status === "pending_key")) forbidden();
		return { vault, grant, member };
	}
	async requireSharing(organizationId: string) {
		const plan = await this.policy.readOrganizationPolicy(organizationId);
		const sharing = organizationSharingPolicy(plan.id);
		if (!sharing.enabled)
			throw new SharingError(
				403,
				"sharing_unavailable",
				"Organization sharing requires Sync Plus",
			);
		return sharing;
	}
	async organization(userId: string, organizationId: string) {
		const actor = await this.requireOrganization(userId, organizationId);
		const [organization, plan, members, vaults] = await Promise.all([
			this.store.organization(organizationId),
			this.policy.readOrganizationPolicy(organizationId),
			this.store.members(organizationId),
			this.store.vaults(organizationId),
		]);
		const manage = isManager(actor.role);
		const visibleVaults = [];
		for (const vault of vaults) {
			const grant = await this.store.grant(vault.id, userId);
			const status = vaultEnrollmentStatus(grant);
			const grants = manage ? await this.store.grants(vault.id) : [];
			visibleVaults.push({
				id: vault.id,
				name: vault.name,
				shared: vault.sharedAt !== null,
				personal: grant?.isCreator === true,
				canManage: manage,
				status,
				members: manage ? members.map((member) => {
					const grant = grants.find((grant) => grant.userId === member.id);
					return { userId: member.id, name: member.name, email: member.email,
						canManage: isManager(member.role),
						status: vaultEnrollmentStatus(grant) };
				}) : [],
			});
		}
		await this.flushRefreshes();
		return {
			id: organizationId,
			billingUrl: this.config.billingBaseURL
				? new URL(
						`/billing?organizationId=${encodeURIComponent(organizationId)}`,
						this.config.billingBaseURL,
					).toString()
				: null,
			name: organization!.name,
			role: actor.role,
			plan,
			sharing: organizationSharingPolicy(plan.id),
			members: manage ? members : members.filter((m) => m.id === userId),
			vaults: visibleVaults,
			invitations: manage ? await this.store.invitations(organizationId) : [],
		};
	}
	async rename(userId: string, organizationId: string, name: string) {
		await this.requireOrganization(userId, organizationId, true);
		await this.store.rename(organizationId, name);
	}

	async invite(
		actor: SharingActor,
		organizationId: string,
		input: { email: string; role: "admin" | "member" },
	) {
		const inviter = await this.requireOrganization(
			actor.id,
			organizationId,
			true,
		);
		if (input.role === "admin" && inviter.role !== "owner") forbidden();
		const policy = await this.requireSharing(organizationId);
		const email = input.email.trim().toLowerCase();
		const allowed = this.config.allowedEmails
			?.split(",")
			.map((v) => v.trim().toLowerCase())
			.filter(Boolean);
		if (allowed?.length && !allowed.includes(email))
			throw new SharingError(
				400,
				"email_not_allowed",
				"This server's account allowlist does not include that email",
			);
		const invitation = await this.store.createInvitation({
			organizationId,
			email,
			role: input.role,
			inviterId: actor.id,
			memberLimit: policy.memberLimit,
		});
		if (!invitation)
			throw new SharingError(
				409,
				"invitation_conflict",
				"Member limit reached, or this person is already a member or invited",
			);
		await this.store.audit(organizationId, actor.id, "invited", invitation.id);
		return this.deliverInvitation(invitation.id, invitation.email);
	}
	private async deliverInvitation(id: string, email: string) {
		const url = new URL("/invitations", this.config.baseURL);
		url.searchParams.set("invitationId", id);
		let emailSent = false;
		if (this.config.email && this.config.emailFrom) {
			const invite = await this.store.invitation(id);
			if (!invite || !(await this.store.claimInvitationDelivery(invite)))
				throw new SharingError(
					429,
					"delivery_rate_limited",
					"Wait a minute before resending this invitation",
				);
			try {
				await this.config.email.send({
					from: this.config.emailFrom,
					to: email,
					subject: "Invitation to a Synch organization",
					text: `Sign in with this email address to review your Synch invitation:\n\n${url.toString()}\n\nYour vault password and encryption keys are never included in invitations.`,
				});
				emailSent = true;
			} catch {
				/* The durable invitation remains visible and can be resent. */
			}
		}
		return { id, url: url.toString(), emailSent };
	}
	async resend(userId: string, organizationId: string, id: string) {
		await this.requireOrganization(userId, organizationId, true);
		await this.requireSharing(organizationId);
		const invite = await this.store.invitation(id);
		if (
			!invite ||
			invite.organizationId !== organizationId ||
			invite.status !== "pending" ||
			invite.expiresAt.getTime() <= Date.now()
		)
			throw new SharingError(
				409,
				"invitation_unavailable",
				"Create a new invitation for expired or canceled invitations",
			);
		return this.deliverInvitation(id, invite.email);
	}
	async cancel(userId: string, organizationId: string, id: string) {
		await this.requireOrganization(userId, organizationId, true);
		const invite = await this.store.invitation(id);
		if (!invite || invite.organizationId !== organizationId) forbidden();
		await this.store.setInvitationStatus(id, "canceled");
		await this.store.audit(organizationId, userId, "invitation_canceled", id);
	}
	private async recipient(actor: SharingActor, id: string) {
		const invite = await this.store.invitation(id);
		const user = await this.store.user(actor.id);
		if (!invite || invite.email.toLowerCase() !== actor.email.toLowerCase())
			forbidden();
		if (this.config.requireVerifiedEmail && !user?.emailVerified)
			throw new SharingError(
				403,
				"verify_email",
				"Verify your email before opening an invitation",
			);
		return invite;
	}
	async invitation(actor: SharingActor, id: string) {
		const invite = await this.recipient(actor, id);
		const org = await this.store.organization(invite.organizationId);
		return {
			id,
			organizationId: invite.organizationId,
			organizationName: org?.name,
			role: invite.role,
			status:
				invite.expiresAt.getTime() <= Date.now() && invite.status === "pending"
					? "expired"
					: invite.status,
			vaults: (await this.store.vaults(invite.organizationId)).map((vault) => ({ vaultId: vault.id, name: vault.name })),
		};
	}
	async respond(actor: SharingActor, id: string, accept: boolean) {
		const invite = await this.recipient(actor, id);
		if (invite.status === "accepted")
			return { organizationId: invite.organizationId };
		if (invite.status !== "pending" || invite.expiresAt.getTime() <= Date.now())
			throw new SharingError(
				409,
				"invitation_unavailable",
				"Invitation expired or canceled",
			);
		if (!accept) {
			await this.store.setInvitationStatus(id, "rejected");
			return { organizationId: invite.organizationId };
		}
		await this.requireSharing(invite.organizationId);
		const inviter = await this.requireOrganization(
			invite.inviterId,
			invite.organizationId,
			true,
		);
		if (invite.role === "admin" && inviter.role !== "owner") forbidden();
		if (
			!(await this.store.acceptInvitation(
				invite,
				actor.id,
			))
		)
			throw new SharingError(
				409,
				"invitation_changed",
				"Invitation changed; refresh and try again",
			);
		await this.flushRefreshes();
		await this.store.audit(
			invite.organizationId,
			actor.id,
			"invitation_accepted",
			id,
		);
		return { organizationId: invite.organizationId };
	}
	async changeMember(
		userId: string,
		organizationId: string,
		targetId: string,
		role?: "admin" | "member",
	) {
		const actor = await this.requireOrganization(userId, organizationId);
		const target = await this.store.membership(organizationId, targetId);
		if (!target) {
			if (!role) return { pending: !(await this.flushRefreshes()) };
			forbidden();
		}
		if (target.role === "owner")
			throw new SharingError(
				409,
				"owner_protected",
				"The organization owner cannot be removed or demoted here",
			);
		if (role) {
			if (actor.role !== "owner") forbidden();
			await this.store.changeOrganizationRole(organizationId, targetId, role);
		} else {
			if (
				userId !== targetId &&
				(!isManager(actor.role) ||
					(target.role === "admin" && actor.role !== "owner"))
			)
				forbidden();
			await this.store.removeOrganizationMember(organizationId, targetId);
		}
		await this.store.audit(
			organizationId,
			userId,
			role ? "member_role_changed" : "member_removed",
			targetId,
		);
		return { pending: !(await this.flushRefreshes()) };
	}
	async refresh(vaultId: string) {
		await this.store.queueRefresh(vaultId);
		await this.flushRefreshes();
	}
	async flushRefreshes(): Promise<boolean> {
		return flushSharingRefreshes(this.store, this.invalidator);
	}
}
function isManager(role: string | null | undefined) {
	return role === "owner" || role === "admin";
}
function forbidden(): never {
	throw new SharingError(
		403,
		"forbidden",
		"You do not have permission for this operation",
	);
}
