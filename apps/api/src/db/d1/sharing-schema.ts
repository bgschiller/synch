import {
	index,
	integer,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";
import { organization } from "./auth-schema";
import { vault } from "./vault-schema";

export const sharingAudit = sqliteTable(
	"sharing_audit",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		actorId: text("actor_id").notNull(),
		action: text("action").notNull(),
		targetId: text("target_id").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(t) => [index("sharing_audit_org_idx").on(t.organizationId, t.createdAt)],
);

// Durable delivery records are retried by management reads and scheduled work.
export const sharingRefresh = sqliteTable("sharing_refresh", {
	vaultId: text("vault_id")
		.primaryKey()
		.references(() => vault.id, { onDelete: "cascade" }),
	revision: text("revision").notNull(),
	createdAt: integer("created_at").notNull(),
});
