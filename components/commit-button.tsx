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
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label={
                            isBusy
                                ? "Busy"
                                : "Commit all changes"
                        }
                        onClick={() => setIsDialogOpen(true)}
                        disabled={isBusy}
                    >
                        <GitCommit /> Commit All
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    {isBusy
                        ? "Busy"
                        : "Commit all changes"}
                </TooltipContent>
            </Tooltip>
            <GitCommitDialog
                workspacePath={workspacePath}
                isBusy={isBusy}
                isOpen={isDialogOpen}
                onOpenChange={setIsDialogOpen}
            />
        </>
    );
}
