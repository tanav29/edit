import "dotenv/config";
import { drizzle } from "drizzle-orm/bun-sqlite";

export const db = drizzle("./edit.sqlite");
