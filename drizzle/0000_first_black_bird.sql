CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_at_idx` ON `activity` (`at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` text PRIMARY KEY NOT NULL,
	`chain` text NOT NULL,
	`contract` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`notes` text NOT NULL,
	`status` text NOT NULL,
	`author` text NOT NULL,
	`updated` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `watchlist_updated_idx` ON `watchlist` (`updated`);