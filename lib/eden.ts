import { treaty } from "@elysiajs/eden";
type App = typeof import("../app/api/[[...slugs]]/route").app;

// .api to enter /api prefix
export const api =
  typeof window === "undefined"
    ? treaty<App>(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
        .api
    : treaty<App>(window.location.origin).api;
