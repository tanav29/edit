"use client";

import { GitBranch, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

type BranchSelectorProps = {
    workspacePath: string;
};

type BranchData = {
    current: string | null;
    branches: string[];
    isGitRepo: boolean;
};

export default function BranchSelector({
    workspacePath,
}: BranchSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [branchData, setBranchData] = useState<BranchData | null>(null);
    const [loading, setLoading] = useState(false);
    const [initializing, setInitializing] = useState(false);
    const [switching, setSwitching] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchBranches = useCallback(async () => {
        if (!workspacePath) return;
        setLoading(true);
        try {
            const res = await fetch(
                `/api/git/branches?path=${encodeURIComponent(workspacePath)}`,
            );
            if (!res.ok) {
                setBranchData(null);
                return;
            }
            const data = (await res.json()) as BranchData;
            setBranchData(data);
        } catch {
            setBranchData(null);
        } finally {
            setLoading(false);
        }
    }, [workspacePath]);

    useEffect(() => {
        fetchBranches();
    }, [fetchBranches]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    async function handleInit() {
        setInitializing(true);
        try {
            const res = await fetch("/api/git/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: workspacePath }),
            });
            const data = (await res.json()) as { error?: string };
            if (!res.ok) {
                throw new Error(data.error || "Failed to init git");
            }
            toast.success("Git repository initialized");
            await fetchBranches();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to init git",
            );
        } finally {
            setInitializing(false);
        }
    }

    async function handleSwitch(branch: string) {
        if (branch === branchData?.current) {
            setIsOpen(false);
            return;
        }

        setSwitching(branch);
        try {
            const res = await fetch("/api/git/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: workspacePath, branch }),
            });
            const data = (await res.json()) as { error?: string };
            if (!res.ok) {
                throw new Error(data.error || "Failed to switch branch");
            }
            setIsOpen(false);
            toast.success(`Switched to ${branch}`);
            await fetchBranches();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to switch branch",
            );
        } finally {
            setSwitching(null);
        }
    }

    if (!branchData && !loading) {
        return null;
    }

    if (branchData && !branchData.isGitRepo) {
        return (
            <button
                type="button"
                disabled={initializing}
                onClick={handleInit}
                className="focus:outline-none"
            >
                <Badge
                    variant="secondary"
                    className="cursor-pointer gap-1"
                >
                    <Plus className="size-3" />
                    {initializing ? "…" : "git init"}
                </Badge>
            </button>
        );
    }

    const currentBranch = branchData?.current ?? "…";

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => {
                    if (branchData) setIsOpen((prev) => !prev);
                }}
                className="focus:outline-none"
            >
                <Badge
                    variant="secondary"
                    className="cursor-pointer gap-1"
                >
                    <GitBranch className="size-3" />
                    {loading ? "…" : currentBranch}
                </Badge>
            </button>

            {isOpen && branchData && (
                <div className="absolute left-0 top-full z-50 mt-1 min-w-40 origin-top-left rounded-lg border bg-popover p-1 shadow-lg">
                    <div className="max-h-60 overflow-y-auto">
                        {branchData.branches.map((branch) => {
                            const isCurrent = branch === branchData.current;
                            const isSwitching = switching === branch;
                            return (
                                <button
                                    key={branch}
                                    type="button"
                                    disabled={isCurrent || isSwitching}
                                    onClick={() => handleSwitch(branch)}
                                    className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors ${
                                        isCurrent
                                            ? "bg-accent text-accent-foreground"
                                            : "hover:bg-accent hover:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-64"
                                    } ${isSwitching ? "opacity-50" : ""}`}
                                >
                                    <span className="flex-1 truncate">
                                        {branch}
                                    </span>
                                    {isCurrent && (
                                        <span className="text-xs text-muted-foreground">
                                            current
                                        </span>
                                    )}
                                    {isSwitching && (
                                        <span className="text-xs text-muted-foreground">
                                            switching…
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
