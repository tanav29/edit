CREATE INDEX `chats_updated_at_idx` ON `chats` (`updated_at`);--> statement-breakpoint
CREATE INDEX `chats_workspace_updated_at_idx` ON `chats` (`workspace_path`,`updated_at`);