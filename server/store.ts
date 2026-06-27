import { db } from "@/db";
import { chats } from "@/db/schema";
import { buildStoredMessages } from "@/lib/chat-store-utils";
import { normalizeMessageOrder, parseMessages } from "@/lib/utils";
import { desc, eq } from "drizzle-orm";
import path from "path";
import type { UIMessage } from "ai";

export type ChatSessionSummary = {
    id: string;
    workspacePath: string;
    title: string | null;
    createdAt: number;
    updatedAt: number;
};

export type ChatSession = ChatSessionSummary & {
    messages: UIMessage[];
    workspace: string;
};

export async function listSessions(): Promise<ChatSessionSummary[]> {
    return db
        .select({
            id: chats.id,
            workspacePath: chats.workspacePath,
            title: chats.title,
            status: chats.status,
            createdAt: chats.createdAt,
            updatedAt: chats.updatedAt,
        })
        .from(chats)
        .orderBy(desc(chats.updatedAt));
}

export async function createSession({
    id,
    workspacePath,
}: {
    id: string;
    workspacePath: string;
}): Promise<ChatSessionSummary> {
    const now = Date.now();
    const { nextMessages, title } = buildStoredMessages({
        incomingMessages: [],
    });

    await db.insert(chats).values({
        id,
        workspacePath,
        title,
        messages: JSON.stringify(nextMessages),
        createdAt: now,
        updatedAt: now,
    });

    return {
        id,
        workspacePath,
        title,
        createdAt: now,
        updatedAt: now,
    };
}

export async function getSession(id: string): Promise<ChatSession | null> {
    const row = await db
        .select()
        .from(chats)
        .where(eq(chats.id, id))
        .limit(1)
        .then((rows) => rows[0]);

    if (!row) return null;

    return {
        id: row.id,
        workspacePath: row.workspacePath,
        workspace: row.workspacePath,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        messages: normalizeMessageOrder(parseMessages(row.messages)),
    };
}

export async function deleteSession(id: string): Promise<void> {
    await db.delete(chats).where(eq(chats.id, id));
}

export async function storeMessages({
    id,
    messages,
    workspace,
}: {
    id: string;
    messages: UIMessage[];
    workspace: string;
}) {
    const trimmedWorkspace = workspace.trim();

    if (!trimmedWorkspace) {
        throw new Error("Workspace path is required");
    }

    const workspacePath = path.normalize(trimmedWorkspace);
    const existing = await getSession(id);

    if (existing && existing.workspacePath !== workspacePath) {
        throw new Error(
            "Session workspace does not match the stored workspace",
        );
    }

    if (!existing) {
        await createSession({ id, workspacePath });
    }

    const now = Date.now();
    const { nextMessages, title } = buildStoredMessages({
        incomingMessages: messages,
    });

    await db
        .update(chats)
        .set({
            title,
            messages: JSON.stringify(nextMessages),
            updatedAt: now,
        })
        .where(eq(chats.id, id));
}
