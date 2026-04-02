import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { readdir, stat } from "fs/promises";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

type ScannedNode = FileNode & {
  mtimeMs: number;
};

const IGNORED_PATTERNS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".env",
  ".env.local",
  ".DS_Store",
  "coverage",
];

async function scanDirectory(dirPath: string): Promise<FileNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nodePromises = entries.map(async (entry): Promise<ScannedNode | null> => {
    if (IGNORED_PATTERNS.some((pattern) => entry.name.includes(pattern))) {
      return null;
    }

    const fullPath = join(dirPath, entry.name);
    const info = await stat(fullPath);
    const isDir = entry.isDirectory();

    return {
      name: entry.name,
      path: fullPath,
      type: isDir ? "directory" : "file",
      children: isDir ? [] : undefined,
      mtimeMs: info.mtimeMs,
    };
  });

  const nodes = (await Promise.all(nodePromises)).filter(
    (node): node is ScannedNode => node !== null,
  );

  const sorted = nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    if (a.mtimeMs !== b.mtimeMs) {
      return b.mtimeMs - a.mtimeMs;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return sorted.map((node) => ({
    name: node.name,
    path: node.path,
    type: node.type,
    children: node.children,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reqPath = searchParams.get("path");

    if (!reqPath) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

    // Check if it's a file using Bun.file (fast, no stat syscall)
    const file = Bun.file(reqPath);
    if (await file.exists()) {
      return NextResponse.json({
        name: reqPath.split("/").pop() || "",
        path: reqPath,
        type: "file",
      });
    }

    // Otherwise treat as directory
    const children = await scanDirectory(reqPath);
    
    return NextResponse.json({
      name: reqPath.split("/").pop() || "",
      path: reqPath,
      type: "directory",
      children,
    });
  } catch (error) {
    console.error("Error scanning directory:", error);
    return NextResponse.json(
      { error: "Failed to scan directory" },
      { status: 500 }
    );
  }
}
