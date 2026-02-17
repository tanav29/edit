import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { readdir } from "fs/promises";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

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
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (IGNORED_PATTERNS.some((pattern) => entry.name.includes(pattern))) {
      continue;
    }

    const fullPath = join(dirPath, entry.name);
    const isDir = entry.isDirectory();

    const node: FileNode = {
      name: entry.name,
      path: fullPath,
      type: isDir ? "directory" : "file",
    };

    if (isDir) {
      node.children = [];
    }

    nodes.push(node);
  }

  return nodes.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === "directory" ? -1 : 1;
  });
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
