"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "./ui/tooltip";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import workerUrl from "@pierre/diffs/worker/worker-portable.js?url";

const workerFactory = () => new Worker(workerUrl);

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
        },
    },
});

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <WorkerPoolContextProvider
                poolOptions={{
                    workerFactory,
                    poolSize: 2,
                }}
                highlighterOptions={{}}
            >
                <TooltipProvider>{children}</TooltipProvider>
            </WorkerPoolContextProvider>
        </QueryClientProvider>
    );
}
