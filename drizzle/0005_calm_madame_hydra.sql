CREATE TABLE `cap_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`identity` text NOT NULL,
	`fetched` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cap_observations_identity_fetched_idx` ON `cap_observations` (`identity`,`fetched`);--> statement-breakpoint
CREATE TABLE `cap_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`identity` text NOT NULL,
	`chain` text NOT NULL,
	`direction` text NOT NULL,
	`after` integer NOT NULL,
	`detected` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cap_signals_identity_direction_after_idx` ON `cap_signals` (`identity`,`direction`,`after`);--> statement-breakpoint
CREATE INDEX `cap_signals_detected_idx` ON `cap_signals` (`detected`);