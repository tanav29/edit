import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join } from "path";

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
  const entries = await readdir(dirPath);
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (IGNORED_PATTERNS.some((pattern) => entry.includes(pattern))) {
      continue;
    }

    const fullPath = join(dirPath, entry);
    const stats = await stat(fullPath);

    const node: FileNode = {
      name: entry,
      path: fullPath,
      type: stats.isDirectory() ? "directory" : "file",
    };

    if (stats.isDirectory()) {
      node.children = []; // Empty initially, loaded on demand
    }

    nodes.push(node);
  }

  // Sort: directories first, then files, both alphabetically
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
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

    const stats = await stat(path);
    
    if (stats.isFile()) {
      return NextResponse.json({
        name: path.split("/").pop() || "",
        path,
        type: "file",
      });
    }

    const children = await scanDirectory(path);
    
    return NextResponse.json({
      name: path.split("/").pop() || "",
      path,
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
