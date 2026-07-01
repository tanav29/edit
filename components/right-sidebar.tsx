"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ChevronDown,
    Files,
    Folder,
    Globe,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    Plus,
    Shell,
    Terminal,
    Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRightSide } from "@/store/store";
import FileTree from "./file-tree";

export type ChatSessionSummary = {
    id: string;
    workspacePath: string;
    title: string | null;
    createdAt: number;
    updatedAt: number;
};

export default function RightSidebar({ workspace }: any) {
    const [side, toggleSide] = useRightSide();

    return (
        <>
            <aside
                className={cn(
                    "flex h-full shrink-0 flex-col border-l bg-card/30",
                    side
                        ? "w-[50rem] translate-x-0 opacity-100"
                        : "w-0 -translate-x-3 opacity-0 overflow-hidden border-r-0 pointer-events-none",
                )}
            >
                <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
                    <div className="gap-2 flex">
                        <Button
                            variant="outline"
                            size="sm"
                            // onClick={() =>
                            // setIsFileBarOpen((prev) => !prev)
                            // }
                        >
                            <Terminal />
                            Terminal
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            // onClick={() =>
                            // setIsFileBarOpen((prev) => !prev)
                            // }
                        >
                            <Files />
                            Files
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            // onClick={() =>
                            // setIsFileBarOpen((prev) => !prev)
                            // }
                        >
                            <Globe />
                            Browser
                        </Button>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={toggleSide}
                        aria-label="Close sessions sidebar"
                    >
                        <PanelRightClose />
                    </Button>
                </div>

                <div className="w-full h-full">
                    <FileTree rootPath={workspace} />
                </div>
            </aside>
        </>
    );
}
