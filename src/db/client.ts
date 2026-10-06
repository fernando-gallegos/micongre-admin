import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

export function getDb() {
	return drizzle(getEnv().DB, { schema });
}

export type Database = ReturnType<typeof getDb>;
