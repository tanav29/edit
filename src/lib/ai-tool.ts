import { tool } from "ai";
import { toolRead, toolWrite, globSearch, toolBash } from "@/lib/tauri-api";
import { z } from "zod";

export const readFileSchema = z.object({
  filePath: z.string().describe("The path to the file to read"),
  offset: z.number().optional().describe("Line offset to start reading from"),
  limit: z.number().optional().describe("Number of lines to read"),
});

export const writeFileSchema = z.object({
  filePath: z.string().describe("The path to the file to write"),
  content: z.string().describe("The content to write to the file"),
});

export const globSearchSchema = z.object({
  pattern: z.string().describe("Glob pattern to search for files"),
});

export const bashCommandSchema = z.object({
  command: z.string().describe("The bash command to execute"),
  timeoutMs: z.number().optional().describe("Timeout in milliseconds"),
});

export const readTool = tool({
  description: "Read the contents of a file from the filesystem",
  parameters: readFileSchema,
  execute: async ({ filePath, offset, limit }, {}) => {
    try {
      const result = await toolRead(filePath, offset, limit);
      return {
        content: result.content,
        filePath: result.filePath,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const writeTool = tool({
  description: "Write content to a file in the filesystem",
  parameters: writeFileSchema,
  execute: async ({ filePath, content }, {}) => {
    try {
      await toolWrite(filePath, content);
      return { success: true, filePath };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const globTool = tool({
  description: "Search for files matching a glob pattern",
  parameters: globSearchSchema,
  execute: async ({ pattern }, { workspacePath }) => {
    try {
      const result = await globSearch(workspacePath, pattern);
      return result;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const bashTool = tool({
  description: "Execute a bash command in the workspace",
  parameters: bashCommandSchema,
  execute: async ({ command, timeoutMs }, { workspacePath }) => {
    try {
      const result = await toolBash(workspacePath, command, timeoutMs);
      return result;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

export const tools = {
  read: readTool,
  write: writeTool,
  glob: globTool,
  bash: bashTool,
};

export type ToolNames = keyof typeof tools;
