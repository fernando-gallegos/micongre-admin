import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { users } from "@/db/schema";

function slugify(fullName: string): string {
	return fullName
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // quita acentos
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, ".")
		.replace(/^\.+|\.+$/g, "");
}

/** Genera un username único a partir del nombre completo — nunca lo elige el
 * publicador. Colisiona → agrega un sufijo numérico incremental. */
export async function generateUsername(db: Database, fullName: string): Promise<string> {
	const base = slugify(fullName) || "publicador";
	let candidate = base;
	let suffix = 1;

	// El universo de publicadores por congregación es pequeño (~100-300), así
	// que este loop nunca itera más que unas pocas veces en la práctica.
	while (true) {
		const [existing] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, candidate))
			.limit(1);
		if (!existing) return candidate;
		suffix += 1;
		candidate = `${base}${suffix}`;
	}
}
