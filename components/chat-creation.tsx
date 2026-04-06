import { useState } from "react";
import { nanoid } from "nanoid";
import { Plus } from "lucide-react";
import { useQueryState } from "nuqs";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { api } from "@/lib/eden";

export default function ChatCreation({ refetch }: any) {
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatWorkspacePath, setNewChatWorkspacePath] = useState("");
  const [newChatWorkspaceError, setNewChatWorkspaceError] = useState<
    string | null
  >(null);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [, setSession] = useQueryState("s");

  function handleNewChat(nextWorkspacePath?: string) {
    setNewChatWorkspacePath(nextWorkspacePath ?? "");
    setNewChatWorkspaceError(null);
    setIsNewChatModalOpen(true);
  }

  function handleCloseNewChatModal() {
    if (isCreatingNewChat) return;
    setIsNewChatModalOpen(false);
    setNewChatWorkspaceError(null);
  }

  async function handleCreateNewChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextWorkspacePath = newChatWorkspacePath.trim();
    if (!nextWorkspacePath || isCreatingNewChat) return;

    setIsCreatingNewChat(true);
    setNewChatWorkspaceError(null);

    try {
      const response = await fetch(
        `/api/files?path=${encodeURIComponent(nextWorkspacePath)}`,
      );
      const data = (await response.json()) as {
        error?: string;
        type?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to open workspace");
      }

      if (data.type !== "directory") {
        throw new Error("Workspace path must point to a directory");
      }

      const newSessionId = nanoid();
      await api.store.post({
        id: newSessionId,
        workspace: nextWorkspacePath,
        messages: [],
      });
      setSession(newSessionId);

      setIsNewChatModalOpen(false);
      setNewChatWorkspaceError(null);
    } catch (error) {
      setNewChatWorkspaceError(
        error instanceof Error ? error.message : "Failed to open workspace",
      );
    } finally {
      setIsCreatingNewChat(false);
    }
  }

  return (
    <>
      <Button
        size="icon-sm"
        variant="outline"
        title="New chat"
        onClick={() => {
          refetch?.();
          handleNewChat();
        }}>
        <Plus className="size-4" />
        <span className="sr-only">New chat</span>
      </Button>

      <Dialog open={isNewChatModalOpen} onOpenChange={handleCloseNewChatModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select workspace for new session</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateNewChat} className="space-y-4">
            <div className="space-y-3">
              <Input
                autoFocus
                value={newChatWorkspacePath}
                onChange={(event) => {
                  setNewChatWorkspacePath(event.target.value);
                  if (newChatWorkspaceError) setNewChatWorkspaceError(null);
                }}
                placeholder="/absolute/path/to/project"
              />
              {newChatWorkspaceError ? (
                <p className="text-sm text-destructive">
                  {newChatWorkspaceError}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose where the new chat should run.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={!newChatWorkspacePath.trim() || isCreatingNewChat}>
                {isCreatingNewChat ? "Creating..." : "Create chat"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
