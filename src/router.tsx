import {
    RouterProvider,
    createRoute,
    createRouter,
} from "@tanstack/react-router";
import { rootRoute } from "./routes/root";
import { ChatRouteComponent } from "./routes/chat";

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    validateSearch: (search: Record<string, unknown>) => ({
        s: typeof search.s === "string" ? search.s : undefined,
    }),
    component: ChatRouteComponent,
});

const routeTree = rootRoute.addChildren([indexRoute]);

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
