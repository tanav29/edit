"use client";

import { GitCommit } from "lucide-react";
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
  async function handleCommit() {
    if (!workspacePath || isBusy) return;

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
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={handleCommit}
          disabled={isBusy}>
          <GitCommit />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isBusy ? "Busy" : "Commit all changes"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
