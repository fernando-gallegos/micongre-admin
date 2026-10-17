// Idempotencia de las escrituras que la app Android guarda sin internet y reintenta: cada operación lleva una clave única en la cabecera
// `Idempotency-Key`. Si ya se procesó (el servidor la aceptó pero la respuesta no llegó), se responde «ok» sin repetir el efecto.
// Las rutas que la aceptan llaman `replayIfProcessed` al empezar y `rememberOperation` solo cuando la operación salió bien.
import { and, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Database } from "@/db/client";
import { processedOperations } from "@/db/schema";

const HEADER = "idempotency-key";
const KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;

/** Clave de la petición, si trae una válida. */
export function operationKey(request: Request): string | null {
	const key = request.headers.get(HEADER);
	return key && KEY_RE.test(key) ? key : null;
}

/** Si esa operación ya se procesó para esta persona, la respuesta «ok» que se devolvió entonces; si no, null. */
export async function replayIfProcessed(db: Database, request: Request, userId: string): Promise<NextResponse | null> {
	const key = operationKey(request);
	if (!key) return null;
	const [row] = await db.select({ userId: processedOperations.userId }).from(processedOperations).where(eq(processedOperations.opKey, key)).limit(1);
	return row && row.userId === userId ? NextResponse.json({ ok: true, duplicate: true }) : null;
}

/** Registra la operación como procesada (llamar solo si salió bien). */
export async function rememberOperation(db: Database, request: Request, userId: string): Promise<void> {
	const key = operationKey(request);
	if (!key) return;
	await db.insert(processedOperations).values({ opKey: key, userId }).onConflictDoNothing();
}

/** Borra las claves viejas (el job diario): una operación en cola no espera más de unas semanas. */
export async function purgeOldOperations(db: Database, keepDays = 45): Promise<void> {
	await db.delete(processedOperations).where(and(lt(processedOperations.createdAt, new Date(Date.now() - keepDays * 86_400_000))));
}
