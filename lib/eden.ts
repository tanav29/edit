import { treaty } from "@elysiajs/eden";
type App = typeof import("../server/app").app;

// .api to enter /api prefix
export const api =
  typeof window === "undefined"
    ? treaty<App>(process.env.API_BASE_URL ?? "http://localhost:3001").api
    : treaty<App>(window.location.origin).api;
