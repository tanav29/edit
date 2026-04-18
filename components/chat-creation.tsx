import { useState } from "react";
import { nanoid } from "nanoid";
import { Plus } from "lucide-react";
import { useQueryState } from "nuqs";

import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { api } from "@/lib/eden";
import WorkspaceDirectoryPalette from "@/components/workspace-directory-palette";

type ChatCreationProps = {
  refetch?: () => void | Promise<unknown>;
};

export default function ChatCreation({ refetch }: ChatCreationProps) {
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatWorkspacePath, setNewChatWorkspacePath] = useState("");
  const [newChatWorkspaceError, setNewChatWorkspaceError] = useState<
    string | null
  >(null);
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [, setSession] = useQueryState("s");

  function normalizeWorkspacePath(value: string) {
    const trimmed = value.trim();
    if (trimmed === "/" || /^[A-Za-z]:[\\/]+$/.test(trimmed)) return trimmed;
    return trimmed.replace(/[\\/]+$/g, "");
  }

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

    const nextWorkspacePath = normalizeWorkspacePath(newChatWorkspacePath);
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="New chat"
            onClick={() => {
              refetch?.();
              handleNewChat();
            }}>
            <Plus className="size-4" />
            <span className="sr-only">New chat</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">New chat</TooltipContent>
      </Tooltip>

      <Dialog open={isNewChatModalOpen} onOpenChange={handleCloseNewChatModal}>
        <DialogContent showCloseButton={false}>
          <form onSubmit={handleCreateNewChat} className="space-y-4">
            <div className="space-y-3">
              <WorkspaceDirectoryPalette
                autoFocus
                value={newChatWorkspacePath}
                onValueChange={setNewChatWorkspacePath}
                errorMessage={newChatWorkspaceError}
                onClearError={() => setNewChatWorkspaceError(null)}
                placeholder="/absolute/path/to/project"
              />
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={!newChatWorkspacePath.trim() || isCreatingNewChat}>
                {isCreatingNewChat ? "Creating..." : "Create Session"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
