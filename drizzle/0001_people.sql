CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_members_user` ON `project_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `assignee_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `tasks_assignee` ON `tasks` (`assignee_id`);