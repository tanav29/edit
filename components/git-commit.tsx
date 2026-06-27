"use client";

import {
    Cloud,
    GitBranch,
    GitCommitHorizontal,
    GitCompareArrows,
    GitPullRequestArrow,
    Loader2,
    Sparkles,
    Terminal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type GitStatusEntry = {
    path: string;
    status:
        | "added"
        | "deleted"
        | "ignored"
        | "modified"
        | "renamed"
        | "untracked";
};

type RemoteInfo = {
    remotes: { name: string; url: string }[];
    ahead: number;
    behind: number;
    currentBranch: string;
    commitHash: string;
};

type GitCommitDialogProps = {
    workspacePath: string;
    isBusy: boolean;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
};

const STATUS_COLORS: Record<string, { label: string; class: string }> = {
    added: { label: "A", class: "bg-green-600 text-white" },
    deleted: { label: "D", class: "bg-red-600 text-white" },
    modified: { label: "M", class: "bg-yellow-600 text-white" },
    renamed: { label: "R", class: "bg-blue-600 text-white" },
    untracked: { label: "U", class: "bg-gray-500 text-white" },
};

export default function GitCommitDialog({
    workspacePath,
    isBusy,
    isOpen,
    onOpenChange,
}: GitCommitDialogProps) {
    const [statusEntries, setStatusEntries] = useState<GitStatusEntry[]>([]);
    const [remoteInfo, setRemoteInfo] = useState<RemoteInfo | null>(null);
    const [commitMessage, setCommitMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [generating, setGenerating] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    const fetchStatus = useCallback(async () => {
        if (!workspacePath) return;
        setLoading(true);
        try {
            const res = await fetch(
                `/api/git/status?path=${encodeURIComponent(workspacePath)}`,
            );
            if (!res.ok) {
                setStatusEntries([]);
                return;
            }
            const data = (await res.json()) as {
                ok: boolean;
                entries: GitStatusEntry[];
            };
            setStatusEntries(data.entries ?? []);
        } catch {
            setStatusEntries([]);
        } finally {
            setLoading(false);
        }
    }, [workspacePath]);

    const fetchRemote = useCallback(async () => {
        if (!workspacePath) return;
        try {
            const res = await fetch(
                `/api/git/remote?path=${encodeURIComponent(workspacePath)}`,
            );
            if (!res.ok) {
                setRemoteInfo(null);
                return;
            }
            const data = (await res.json()) as RemoteInfo & { ok: boolean };
            setRemoteInfo(data);
        } catch {
            setRemoteInfo(null);
        }
    }, [workspacePath]);

    useEffect(() => {
        if (!isOpen) return;
        fetchStatus();
        fetchRemote();
        setCommitMessage("");

        const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === "git-status-changed") {
                    fetchStatus();
                    fetchRemote();
                }
            } catch {
                // ignore malformed messages
            }
        };

        ws.onerror = () => {};

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [isOpen, fetchStatus, fetchRemote]);

    async function handleAutoGenerate() {
        if (!workspacePath || generating) return;
        setGenerating(true);
        try {
            const res = await fetch("/api/git/commit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    path: workspacePath,
                }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: string };
                throw new Error(data.error || "Failed to generate message");
            }
            const data = (await res.json()) as { message?: string };
            setCommitMessage(data.message ?? "");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to generate message",
            );
        } finally {
            setGenerating(false);
        }
    }

    async function handleCommit() {
        if (!workspacePath || committing || isBusy) return;
        setCommitting(true);
        try {
            const res = await fetch("/api/git/commit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    path: workspacePath,
                    message: commitMessage || undefined,
                }),
            });
            const data = (await res.json()) as {
                error?: string;
                message?: string;
                commitHash?: string;
            };
            if (!res.ok) {
                throw new Error(data.error || "Failed to commit");
            }
            const hash = data.commitHash ? `${data.commitHash} · ` : "";
            toast.success(`${hash}${data.message ?? "Committed"}`);
            setCommitMessage("");
            await fetchStatus();
            await fetchRemote();
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Failed to commit",
            );
        } finally {
            setCommitting(false);
        }
    }

    async function handlePush() {
        if (!workspacePath || pushing) return;
        setPushing(true);
        try {
            const res = await fetch("/api/git/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: workspacePath }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: string };
                throw new Error(data.error || "Push failed");
            }
            toast.success("Pushed successfully");
            await fetchRemote();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Push failed");
        } finally {
            setPushing(false);
        }
    }

    async function handlePull() {
        if (!workspacePath || pulling) return;
        setPulling(true);
        try {
            const res = await fetch("/api/git/pull", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: workspacePath }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { error?: string };
                throw new Error(data.error || "Pull failed");
            }
            toast.success("Pulled successfully");
            await fetchRemote();
            await fetchStatus();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Pull failed");
        } finally {
            setPulling(false);
        }
    }

    const hasChanges = statusEntries.length > 0;
    const hasRemote = remoteInfo && remoteInfo.remotes.length > 0;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitCommitHorizontal className="size-5" />
                        Commit Changes
                    </DialogTitle>
                    <DialogDescription>
                        {remoteInfo && (
                            <div className="flex items-center gap-3">
                                <Badge variant="secondary" className="gap-1">
                                    <GitBranch className="size-3" />
                                    {remoteInfo.currentBranch}
                                </Badge>
                                {remoteInfo.commitHash && (
                                    <Badge
                                        variant="outline"
                                        className="gap-1 font-mono text-xs"
                                    >
                                        <GitCommitHorizontal className="size-3" />
                                        {remoteInfo.commitHash}
                                    </Badge>
                                )}
                                {hasRemote && (
                                    <>
                                        {remoteInfo.ahead > 0 && (
                                            <Badge
                                                variant="warning"
                                                className="gap-1"
                                            >
                                                <GitCompareArrows className="size-3" />
                                                {remoteInfo.ahead} ahead
                                            </Badge>
                                        )}
                                        {remoteInfo.behind > 0 && (
                                            <Badge
                                                variant="info"
                                                className="gap-1"
                                            >
                                                <GitPullRequestArrow className="size-3" />
                                                {remoteInfo.behind} behind
                                            </Badge>
                                        )}
                                        {remoteInfo.ahead === 0 &&
                                            remoteInfo.behind === 0 && (
                                                <span className="text-xs text-muted-foreground">
                                                    up to date
                                                </span>
                                            )}
                                        <Badge
                                            variant="outline"
                                            className="gap-1"
                                        >
                                            <Cloud className="size-3" />
                                            {remoteInfo.remotes[0]?.name ??
                                                "origin"}
                                        </Badge>
                                    </>
                                )}
                            </div>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <DialogPanel>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                                Changed Files
                                {statusEntries.length > 0 && (
                                    <span className="ml-1 text-muted-foreground">
                                        ({statusEntries.length})
                                    </span>
                                )}
                            </span>
                        </div>
                        {loading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : hasChanges ? (
                            <ScrollArea className="max-h-48">
                                <div className="space-y-0.5">
                                    {statusEntries.map((entry) => (
                                        <div
                                            key={entry.path}
                                            className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent/50"
                                        >
                                            <Badge
                                                className={
                                                    STATUS_COLORS[entry.status]
                                                        ?.class ??
                                                    "bg-gray-500 text-white"
                                                }
                                                size="sm"
                                            >
                                                {STATUS_COLORS[entry.status]
                                                    ?.label ?? "?"}
                                            </Badge>
                                            <span className="truncate font-mono text-xs">
                                                {entry.path}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                            <p className="py-2 text-center text-sm text-muted-foreground">
                                No changes to commit
                            </p>
                        )}
                    </div>

                    <Separator className={"my-4"} />

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                                Commit Message
                            </span>
                            {hasChanges && (
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    loading={generating}
                                    onClick={handleAutoGenerate}
                                >
                                    <Sparkles className="size-3.5" />
                                    Auto-generate
                                </Button>
                            )}
                        </div>
                        <Textarea
                            placeholder={
                                hasChanges
                                    ? "Describe your changes..."
                                    : "No changes to commit"
                            }
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            disabled={!hasChanges}
                            rows={3}
                        />
                    </div>
                </DialogPanel>

                <DialogFooter className="gap-2">
                    {hasRemote && (
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                loading={pulling}
                                disabled={pushing || committing || !hasRemote}
                                onClick={handlePull}
                            >
                                <GitPullRequestArrow className="size-4" />
                                Pull
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                loading={pushing}
                                disabled={
                                    pulling ||
                                    committing ||
                                    remoteInfo?.ahead === 0
                                }
                                onClick={handlePush}
                            >
                                <GitCompareArrows className="size-4" />
                                Push
                            </Button>
                        </div>
                    )}
                    <Button
                        variant="default"
                        size="sm"
                        loading={committing}
                        disabled={!hasChanges || isBusy || pushing || pulling}
                        onClick={handleCommit}
                    >
                        <GitCommitHorizontal className="size-4" />
                        Commit
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}
