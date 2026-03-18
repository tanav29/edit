import { serverApp } from "@/server";

const handler = (request: Request) => serverApp.fetch(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;

export type App = typeof serverApp;
