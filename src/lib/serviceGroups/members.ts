import { inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { users } from "@/db/schema";

/** El superintendente y el auxiliar de un grupo son integrantes de ese grupo: al nombrarlos se les pone ese grupo de servicio. */
export async function joinLeadsToGroup(db: Database, groupId: string, leadIds: (string | null | undefined)[]): Promise<void> {
	const ids = [...new Set(leadIds.filter((id): id is string => !!id))];
	if (ids.length === 0) return;
	await db.update(users).set({ fieldServiceGroupId: groupId }).where(inArray(users.id, ids));
}
