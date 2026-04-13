"use client";

import { useState } from "react";

export type CustomCommand = {
  id: string;
  name: string;
  command: string;
  icon: string;
};

const STORAGE_KEY = "custom-commands";

const DEFAULT_COMMANDS: CustomCommand[] = [
  { id: "1", name: "dev", command: "bun dev", icon: "Play" },
  { id: "2", name: "build", command: "bun run build", icon: "Hammer" },
  { id: "3", name: "lint", command: "bun run lint", icon: "Check" },
];

export function getCustomCommands(): CustomCommand[] {
  if (typeof window === "undefined") return DEFAULT_COMMANDS;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_COMMANDS;
  try {
    return JSON.parse(stored);
  } catch {
    return DEFAULT_COMMANDS;
  }
}

export function saveCustomCommands(commands: CustomCommand[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
}

export function useCustomCommands() {
  const [commands, setCommands] = useState<CustomCommand[]>(() =>
    getCustomCommands(),
  );

  const addCommand = (command: CustomCommand) => {
    const newCommands = [...commands, command];
    setCommands(newCommands);
    saveCustomCommands(newCommands);
  };

  const updateCommand = (id: string, command: Partial<CustomCommand>) => {
    const newCommands = commands.map((c) =>
      c.id === id ? { ...c, ...command } : c
    );
    setCommands(newCommands);
    saveCustomCommands(newCommands);
  };

  const deleteCommand = (id: string) => {
    const newCommands = commands.filter((c) => c.id !== id);
    setCommands(newCommands);
    saveCustomCommands(newCommands);
  };

  const resetToDefaults = () => {
    setCommands(DEFAULT_COMMANDS);
    saveCustomCommands(DEFAULT_COMMANDS);
  };

  return {
    commands,
    addCommand,
    updateCommand,
    deleteCommand,
    resetToDefaults,
  };
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}
