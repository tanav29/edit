/*
  Warnings:

  - You are about to drop the column `messages` on the `ChatSession` table. All the data in the column will be lost.
  - Added the required column `name` to the `ChatSession` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "messageId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "position" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ChatSession" ("createdAt", "id", "path", "updatedAt") SELECT "createdAt", "id", "path", "updatedAt" FROM "ChatSession";
DROP TABLE "ChatSession";
ALTER TABLE "new_ChatSession" RENAME TO "ChatSession";
CREATE INDEX "ChatSession_path_idx" ON "ChatSession"("path");
CREATE INDEX "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_position_idx" ON "ChatMessage"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_sessionId_messageId_key" ON "ChatMessage"("sessionId", "messageId");
