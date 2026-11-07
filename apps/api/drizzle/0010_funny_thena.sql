DROP TABLE `polar_subscription`;--> statement-breakpoint
DROP INDEX `organization_polar_customer_id_unique`;--> statement-breakpoint
ALTER TABLE `organization` DROP COLUMN `polar_customer_id`;--> statement-breakpoint
ALTER TABLE `organization` DROP COLUMN `synced_vaults_override`;