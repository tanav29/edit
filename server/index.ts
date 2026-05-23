import { app } from "./app";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

app.listen({ port, hostname });

const displayHost = hostname === "0.0.0.0" ? "localhost" : hostname;
console.log(`API server listening on http://${displayHost}:${port}`);
