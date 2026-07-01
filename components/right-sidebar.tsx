"use client";

import { useState } from "react";
import { Files, Globe, PanelRightClose } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRightSide } from "@/store/store";
import FileTree from "./file-tree";
import BrowserView from "./browser-view";

type Tab = "files" | "browser";

export default function RightSidebar({ workspace }: any) {
    const [side, toggleSide] = useRightSide();
    const [tab, setTab] = useState<Tab>("files");

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
                            variant={tab === "files" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setTab("files")}
                        >
                            <Files />
                            Files
                        </Button>
                        <Button
                            variant={tab === "browser" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setTab("browser")}
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
                        aria-label="Close right sidebar"
                    >
                        <PanelRightClose />
                    </Button>
                </div>

                <div className="w-full h-full">
                    {tab === "files" ? (
                        <FileTree rootPath={workspace} />
                    ) : (
                        <BrowserView />
                    )}
                </div>
            </aside>
        </>
    );
}
