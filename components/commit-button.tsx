"use client";

import { GitCommit } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type CommitButtonProps = {
  workspacePath: string;
  isBusy: boolean;
};

export default function CommitButton({
  workspacePath,
  isBusy,
}: CommitButtonProps) {
  const [isCommitting, setIsCommitting] = useState(false);

  async function handleCommit() {
    if (!workspacePath || isBusy || isCommitting) return;

    const confirmed = window.confirm(
      "Commit all current changes in this workspace? This will stage and commit everything.",
    );
    if (!confirmed) return;

    setIsCommitting(true);

    const loadingToast = toast.loading("Committing all changes...");

    try {
      const response = await fetch("/api/git/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: workspacePath }),
      });

      const data = (await response.json()) as {
        error?: string;
        message?: string;
        commitHash?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to commit changes");
      }

      const hash = data.commitHash ? `${data.commitHash} · ` : "";
      toast.success(`${hash}${data.message ?? "Update project files"}`, {
        id: loadingToast,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to commit changes",
        {
          id: loadingToast,
        },
      );
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={handleCommit}
          disabled={isBusy || isCommitting}>
          <GitCommit />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isBusy ? "Busy" : isCommitting ? "Committing" : "Commit all changes"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
