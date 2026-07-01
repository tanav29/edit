"use client";

import { GitCommit } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import GitCommitDialog from "@/components/git-commit";

type CommitButtonProps = {
    workspacePath: string;
    isBusy: boolean;
};

export default function CommitButton({
    workspacePath,
    isBusy,
}: CommitButtonProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                aria-label={isBusy ? "Busy" : "Commit all changes"}
                onClick={() => setIsDialogOpen(true)}
                disabled={isBusy}
            >
                <GitCommit /> Commit All
            </Button>
            <GitCommitDialog
                workspacePath={workspacePath}
                isBusy={isBusy}
                isOpen={isDialogOpen}
                onOpenChange={setIsDialogOpen}
            />
        </>
    );
}
