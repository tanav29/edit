import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    workspacePath: text("workspace_path").notNull(),
    title: text("title"),
    messages: text("messages").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    updatedAtIdx: index("chats_updated_at_idx").on(table.updatedAt),
    workspaceUpdatedAtIdx: index("chats_workspace_updated_at_idx").on(
      table.workspacePath,
      table.updatedAt,
    ),
  }),
);

export type ChatRow = typeof chats.$inferSelect;
