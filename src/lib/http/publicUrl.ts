import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations } from "@/db/schema";
import { publicOrigin } from "./origin";

/** ¿Es la dirección interna del Worker (workers.dev)? Esa nunca se muestra ni se comparte. */
export function isWorkerHost(host: string): boolean {
	return host.toLowerCase().endsWith(".workers.dev");
}

/** Dirección pública de la app para armar enlaces (acceso, QR…): la guardada en Congregación; si no hay, la del host con el que se
 * entró (el del router, o un dominio propio). Devuelve null cuando solo se conoce la URL del Worker: entonces no se arma el enlace
 * hasta que se configure la dirección pública. */
export async function publicBaseUrl(db: Database, request: Request): Promise<string | null> {
	const [row] = await db.select({ url: congregations.publicUrl }).from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID)).limit(1);
	if (row?.url) return row.url;
	const origin = publicOrigin(request);
	return isWorkerHost(new URL(origin).hostname) ? null : origin;
}
