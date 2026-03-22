import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const chatSessions = sqliteTable("ChatSession", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const chatMessages = sqliteTable(
  "ChatMessage",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    messageId: text("messageId").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
    position: integer("position").notNull(),
    sessionId: text("sessionId")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
  },
  (table) => ({
    sessionIdPositionIdx: index("ChatMessage_sessionId_position_idx").on(
      table.sessionId,
      table.position,
    ),
    sessionIdMessageIdIdx: uniqueIndex(
      "ChatMessage_sessionId_messageId_key",
    ).on(table.sessionId, table.messageId),
  }),
);

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
  chatMessages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));
