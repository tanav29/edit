CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_path` text NOT NULL,
	`title` text,
	`messages` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
