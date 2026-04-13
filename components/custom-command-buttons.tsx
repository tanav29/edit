"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CustomCommand, useCustomCommands } from "@/lib/custom-commands";
import {
  getIconComponent,
  ManageCommandsDialog,
} from "@/components/custom-commands-dialog";

type CustomCommandButtonsProps = {
  workspacePath: string;
  isBusy: boolean;
};

export default function CustomCommandButtons({
  workspacePath,
  isBusy,
}: CustomCommandButtonsProps) {
  const {
    commands,
    addCommand,
    updateCommand,
    deleteCommand,
    resetToDefaults,
  } = useCustomCommands();

  const [runningCommands, setRunningCommands] = useState<Set<string>>(
    new Set()
  );

  async function handleRunCommand(command: CustomCommand) {
    if (!workspacePath || isBusy || runningCommands.has(command.id)) return;

    const confirmed = window.confirm(
      `Run "${command.command}" in this workspace?`,
    );
    if (!confirmed) return;

    setRunningCommands((prev) => new Set(prev).add(command.id));

    const loadingToast = toast.loading(`Running ${command.name}...`);

    try {
      const response = await fetch("/api/exec", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: workspacePath,
          command: command.command,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        output?: string;
        exitCode?: number;
      };

      if (!response.ok) {
        throw new Error(data.error || "Failed to run command");
      }

      if (data.exitCode === 0) {
        toast.success(`${command.name} completed`, {
          id: loadingToast,
        });
      } else {
        toast.error(`${command.name} failed: ${data.output ?? "Unknown error"}`, {
          id: loadingToast,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to run command",
        {
          id: loadingToast,
        },
      );
    } finally {
      setRunningCommands((prev) => {
        const next = new Set(prev);
        next.delete(command.id);
        return next;
      });
    }
  }

  return (
    <div className="flex items-center gap-1">
      {commands.map((cmd) => {
        const Icon = getIconComponent(cmd.icon);
        const isRunning = runningCommands.has(cmd.id);

        const label = isBusy
          ? "Busy"
          : isRunning
            ? "Running..."
            : cmd.name;

        return (
          <Tooltip key={cmd.id}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={label}
                onClick={() => handleRunCommand(cmd)}
                disabled={isBusy || isRunning}
              >
                {Icon ? <Icon /> : <Settings />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="font-medium">{label}</div>
              <div className="opacity-80">{cmd.command}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}

      <ManageCommandsDialog
        commands={commands}
        onAdd={addCommand}
        onUpdate={updateCommand}
        onDelete={deleteCommand}
        onReset={resetToDefaults}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Manage commands">
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Manage commands</TooltipContent>
        </Tooltip>
      </ManageCommandsDialog>
    </div>
  );
}
