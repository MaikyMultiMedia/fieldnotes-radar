CREATE TABLE `market_budget` (
	`id` text PRIMARY KEY NOT NULL,
	`calls` integer NOT NULL,
	`window_start` integer NOT NULL,
	`blocked_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `market_cache_fetched_idx` ON `market_cache` (`fetched`);