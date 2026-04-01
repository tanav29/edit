"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "./ui/tooltip";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  );
}
