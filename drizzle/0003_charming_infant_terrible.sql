CREATE TABLE `paper_trials` (
	`id` text PRIMARY KEY NOT NULL,
	`chain` text NOT NULL,
	`contract` text NOT NULL,
	`pool` text NOT NULL,
	`status` text NOT NULL,
	`author` text NOT NULL,
	`created` integer NOT NULL,
	`eligible` integer NOT NULL,
	`updated` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `paper_trials_created_idx` ON `paper_trials` (`created`);--> statement-breakpoint
CREATE INDEX `paper_trials_status_eligible_idx` ON `paper_trials` (`status`,`eligible`);