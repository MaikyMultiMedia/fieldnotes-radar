CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`chain` text NOT NULL,
	`address` text NOT NULL,
	`label` text NOT NULL,
	`author` text NOT NULL,
	`updated` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wallets_updated_idx` ON `wallets` (`updated`);