import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";

import Providers from "@/components/providers";

function RootLayout() {
  return (
    <div className="h-screen dark font-sans antialiased">
      <Providers>
        <Outlet />
        <Toaster richColors />
      </Providers>
    </div>
  );
}

export const rootRoute = createRootRoute({
  component: RootLayout,
});
