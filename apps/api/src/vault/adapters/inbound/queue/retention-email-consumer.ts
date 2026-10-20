import type { VaultRetentionEmailMessage } from "../../../application/dto/queue-messages";
import type { RetentionEmailSender } from "../../../application/ports/outbound/retention-email-sender";
import { FREE_VAULT_INACTIVITY_DELETE_DAYS } from "../../../domain/policy";

export class VaultRetentionEmailConsumer {
	constructor(
		private readonly emailSender: RetentionEmailSender,
	) {}

	async handleMessage(message: Message<VaultRetentionEmailMessage>): Promise<void> {
		const body = message.body;
		if (
			body?.type !== "vault_retention_email" ||
			!body.notice?.ownerEmail.trim()
		) {
			message.ack();
			return;
		}
		try {
			const content = renderDeletionNotice(body);
			await this.emailSender.send({
				to: body.notice.ownerEmail,
				subject: content.subject,
				text: content.text,
				html: content.html,
			});
			message.ack();
		} catch {
			message.retry();
		}
	}
}

function renderDeletionNotice(message: VaultRetentionEmailMessage): {
	subject: string;
	text: string;
	html: string;
} {
	const { vaultName, lastCommitAt } = message.notice;
	const lastChange =
		lastCommitAt === null
			? "No content had been synced to this remote vault since it was created."
			: `The last content change synced to this remote vault was on ${formatDate(lastCommitAt)}.`;
	const lines = [
		`Your Synch remote vault “${vaultName}” was automatically deleted on ${formatDate(message.deletedAt)}.`,
		"",
		`On the free plan, remote vaults are deleted after ${FREE_VAULT_INACTIVITY_DELETE_DAYS} days without any synced content changes. ${lastChange}`,
		"",
		"Your local Obsidian vault and its files are unaffected. Only the encrypted remote copy stored by Synch was deleted. This deletion is permanent, and Synch cannot restore that copy.",
		"",
		"To start syncing again, open your local vault in Obsidian and use the Synch plugin to set it up with a new remote vault.",
	];

	return {
		subject: `Synch remote vault deleted due to inactivity: ${vaultName}`,
		text: lines.join("\n"),
		html: lines
			.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : ""))
			.join(""),
	};
}

function formatDate(value: number): string {
	return `${new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	}).format(value)} (UTC)`;
}

function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			}[char] ?? char),
	);
}
