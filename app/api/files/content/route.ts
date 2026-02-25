import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json(
        { error: "Path parameter is required" },
        { status: 400 }
      );
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    const content = await file.text();
    
    return NextResponse.json({
      content,
      filePath,
    });
  } catch (error) {
    console.error("Error reading file:", error);
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}
