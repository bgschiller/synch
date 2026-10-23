-- Vault access now follows organization membership with no key ceremony.
-- Enroll every current member into every vault in their organization, and
-- reactivate any stale enrollment rows from the removed key-request flow.
INSERT INTO vault_membership (vault_id, user_id, access_version, is_creator, status, joined_at, revoked_at)
SELECT v.id, m.user_id, 1, 0, 'active', cast((julianday('now') - 2440587.5)*86400000 as integer), NULL
FROM vault v JOIN member m ON m.organization_id = v.organization_id
WHERE v.deleted_at IS NULL
ON CONFLICT (vault_id, user_id) DO UPDATE SET status='active', revoked_at=NULL;
--> statement-breakpoint
-- Queue access refreshes so coordinators re-evaluate the newly-enrolled members.
INSERT INTO sharing_refresh (vault_id, revision, created_at)
SELECT id, lower(hex(randomblob(16))), cast((julianday('now') - 2440587.5)*86400000 as integer)
FROM vault
WHERE deleted_at IS NULL
ON CONFLICT (vault_id) DO UPDATE SET revision=excluded.revision, created_at=excluded.created_at;
--> statement-breakpoint
DROP TABLE `vault_key_request`;
--> statement-breakpoint
DROP TABLE `vault_key_wrapper`;
