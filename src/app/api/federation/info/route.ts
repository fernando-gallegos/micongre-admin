import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { CONGREGATION_ROW_ID, congregations } from "@/db/schema";

// Público: lo consultan otras instancias para confirmar que esta URL es un
// MiCongre y conocer el nombre de la congregación. Ver docs/federation.md.
export async function GET() {
	const db = getDb();
	const [row] = await db.select({ name: congregations.name }).from(congregations).where(eq(congregations.id, CONGREGATION_ROW_ID));
	return NextResponse.json({ app: "micongre", name: row?.name ?? null });
}
