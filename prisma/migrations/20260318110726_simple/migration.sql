/*
  Warnings:

  - You are about to drop the `ChatMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `name` on the `ChatSession` table. All the data in the column will be lost.
  - Added the required column `messages` to the `ChatSession` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ChatMessage_sessionId_position_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ChatMessage";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ChatSession" ("createdAt", "id", "path", "updatedAt") SELECT "createdAt", "id", "path", "updatedAt" FROM "ChatSession";
DROP TABLE "ChatSession";
ALTER TABLE "new_ChatSession" RENAME TO "ChatSession";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
