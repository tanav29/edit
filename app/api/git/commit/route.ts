import { generateText } from "ai";
import { ollama } from "ollama-ai-provider-v2";
import { execSync } from "child_process";
import { NextResponse } from "next/server";
import path from "path";

type CommitRequestBody = {
  path?: string;
};

function runGit(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}

async function generateCommitMessage(diff: string): Promise<string> {
  try {
    const result = await generateText({
      model: ollama("minimax-m2.5:cloud"),
      prompt: [
        "Generate one concise git commit message in imperative mood.",
        "Rules:",
        "- output only the commit message text",
        "- max 72 characters",
        "- no quotes, no markdown, no prefix labels",
        "- focus on the most meaningful change",
        "",
        "Git diff:",
        diff,
      ].join("\n"),
      maxRetries: 1,
    });

    const message = result.text.replace(/\s+/g, " ").trim();

    if (!message) {
      return "Update project files";
    }

    return message.length > 72 ? message.slice(0, 72).trim() : message;
  } catch {
    return "Update project files";
  }
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CommitRequestBody;
    const workspacePath = body?.path?.trim();

    if (!workspacePath) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    let gitRoot = "";

    try {
      gitRoot = runGit("git rev-parse --show-toplevel", workspacePath);
    } catch {
      return NextResponse.json(
        { error: "Selected directory is not a git repository" },
        { status: 400 },
      );
    }

    const statusBefore = runGit("git status --porcelain", gitRoot);

    if (!statusBefore) {
      return NextResponse.json(
        { error: "No changes to commit" },
        { status: 400 },
      );
    }

    const selectedRelativePath = path.relative(gitRoot, workspacePath) || ".";

    if (selectedRelativePath.startsWith("..")) {
      return NextResponse.json(
        { error: "Selected directory must be inside the git repository" },
        { status: 400 },
      );
    }

    const pathSpec =
      selectedRelativePath === "." ? "." : JSON.stringify(selectedRelativePath);

    runGit(`git add -A -- ${pathSpec}`, gitRoot);

    const stagedDiff = runGit(`git diff --cached -- ${pathSpec}`, gitRoot);
    if (!stagedDiff) {
      return NextResponse.json(
        { error: "No changes to commit in selected directory" },
        { status: 400 },
      );
    }

    const commitMessage = await generateCommitMessage(stagedDiff);

    runGit(
      `git commit -m ${JSON.stringify(commitMessage)} -- ${pathSpec}`,
      gitRoot,
    );

    const commitHash = runGit("git rev-parse --short HEAD", gitRoot);

    return NextResponse.json({
      ok: true,
      message: commitMessage,
      commitHash,
      repository: gitRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Commit failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
