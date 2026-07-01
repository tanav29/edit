import {
  RouterProvider,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { ChatRouteComponent } from "./routes/chat";
import { TerminalRouteComponent } from "./routes/terminal";
import { rootRoute } from "./routes/root";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => ({
    s: typeof search.s === "string" ? search.s : undefined,
  }),
  component: ChatRouteComponent,
});

const terminalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terminal",
  component: TerminalRouteComponent,
});

const routeTree = rootRoute.addChildren([indexRoute, terminalRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouterProvider() {
  return <RouterProvider router={router} />;
}
