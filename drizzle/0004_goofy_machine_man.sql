CREATE TABLE `buy_alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`scan` text
);
--> statement-breakpoint
CREATE TABLE `buy_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`detected` integer NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `buy_alerts_detected_idx` ON `buy_alerts` (`detected`);