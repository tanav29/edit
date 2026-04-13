import { exec } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { path, command } = (await request.json()) as {
      path: string;
      command: string;
    };

    if (!path || !command) {
      return NextResponse.json(
        { error: "Path and command are required" },
        { status: 400 }
      );
    }

    const fullCommand = `cd "${path}" && ${command}`;
    const { stdout, stderr } = await execAsync(fullCommand, {
      timeout: 120000, // 2 minute timeout
    });

    const output = stdout || stderr;

    return NextResponse.json({
      output,
      exitCode: 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    const exitCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "number"
        ? (error as { code: number }).code
        : 1;

    const output =
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      typeof (error as { stdout?: unknown }).stdout === "string"
        ? (error as { stdout: string }).stdout
        : typeof error === "object" &&
            error !== null &&
            "stderr" in error &&
            typeof (error as { stderr?: unknown }).stderr === "string"
          ? (error as { stderr: string }).stderr
          : "";

    return NextResponse.json(
      { error: message, output, exitCode },
      { status: 500 }
    );
  }
}
