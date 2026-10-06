import { asc, isNull } from "drizzle-orm";
import { fieldServiceGroups, households, theocraticAppointments, users } from "@/db/schema";
import { getAppointmentBadges } from "@/lib/publisherLabels";
import {
	assertCanAccessHouseholdsModule,
	assertCanAccessServiceGroupsModule,
	getOwnFieldServiceGroupId,
} from "@/lib/rbac/guards";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";
import { notHiddenAdmin } from "@/lib/rbac/visibility";
import type { BuilderContext } from "../registry";
import type { ReportBlock, ReportDoc } from "../types";

const collator = new Intl.Collator("es");

async function buildServiceGroups({ db, session }: BuilderContext): Promise<ReportDoc> {
	assertCanAccessServiceGroupsModule(session);

	const groups = await db.select().from(fieldServiceGroups).orderBy(asc(fieldServiceGroups.name));
	const members = await db
		.select({ id: users.id, fullName: users.fullName, groupId: users.fieldServiceGroupId })
		.from(users)
		.where(notHiddenAdmin);
	const appointmentRows = await db
		.select({ userId: theocraticAppointments.userId, type: theocraticAppointments.appointmentType })
		.from(theocraticAppointments)
		.where(isNull(theocraticAppointments.endDate));

	const typesByUser = new Map<string, string[]>();
	for (const a of appointmentRows) typesByUser.set(a.userId, [...(typesByUser.get(a.userId) ?? []), a.type]);
	const nameById = new Map(members.map((m) => [m.id, m.fullName]));
	const badges = (userId: string) =>
		getAppointmentBadges(typesByUser.get(userId) ?? [])
			.map((b) => b.code)
			.join(" ");

	const blocks: ReportBlock[] = [];
	groups.forEach((g, index) => {
		const groupMembers = members
			.filter((m) => m.groupId === g.id)
			.sort((a, b) => collator.compare(a.fullName, b.fullName));
		if (index > 0) blocks.push({ type: "pageBreak" });
		blocks.push({ type: "heading", text: g.active ? g.name : `${g.name} (inactivo)`, level: 2 });
		blocks.push({
			type: "keyValue",
			items: [
				{ label: "Superintendente", value: (g.overseerUserId && nameById.get(g.overseerUserId)) || "Sin asignar" },
				{ label: "Auxiliar", value: (g.assistantUserId && nameById.get(g.assistantUserId)) || "Sin asignar" },
				...(g.regularMeetingPlace ? [{ label: "Lugar de reunión", value: g.regularMeetingPlace }] : []),
				{ label: "Integrantes", value: String(groupMembers.length) },
			],
		});
		if (groupMembers.length === 0) {
			blocks.push({ type: "paragraph", text: "Sin integrantes.", muted: true });
		} else {
			blocks.push({
				type: "table",
				table: {
					sheetName: g.name.slice(0, 30),
					columns: [
						{ label: "Nombre", width: 3 },
						{ label: "Nombramiento", width: 1, align: "center" },
						{ label: "Cargo en el grupo", width: 2 },
					],
					rows: groupMembers.map((m) => [
						m.fullName,
						badges(m.id),
						m.id === g.overseerUserId ? "Superintendente" : m.id === g.assistantUserId ? "Auxiliar" : "",
					]),
				},
			});
		}
	});
	if (groups.length === 0) blocks.push({ type: "paragraph", text: "Todavía no hay grupos de servicio.", muted: true });

	return {
		title: "Grupos de servicio",
		fileName: "grupos-de-servicio",
		blocks,
		footer: "Mi Congre",
	};
}

async function buildHouseholds({ db, session }: BuilderContext): Promise<ReportDoc> {
	assertCanAccessHouseholdsModule(session);

	const [householdRows, memberRows] = await Promise.all([
		db.select().from(households).orderBy(asc(households.label)),
		db
			.select({ id: users.id, fullName: users.fullName, householdId: users.householdId, groupId: users.fieldServiceGroupId })
			.from(users)
			.where(notHiddenAdmin),
	]);

	// Mismo alcance que GET /api/households.
	let visible = householdRows;
	if (session.role !== "admin" && !session.privilegeCodes.includes(PRIVILEGE_CODES.HOUSEHOLDS_ALL)) {
		const ownGroupId = await getOwnFieldServiceGroupId(db, session.userId);
		const inGroup = new Set(memberRows.filter((m) => m.groupId === ownGroupId).map((m) => m.householdId));
		const withMembers = new Set(memberRows.map((m) => m.householdId));
		visible = householdRows.filter((h) => inGroup.has(h.id) || !withMembers.has(h.id));
	}

	const rows = visible.map((h) => {
		const people = memberRows
			.filter((m) => m.householdId === h.id)
			.map((m) => m.fullName)
			.sort((a, b) => collator.compare(a, b));
		return [h.label, people.length, people.join(", ") || "Sin integrantes"] as [string, number, string];
	});

	const blocks: ReportBlock[] =
		rows.length === 0
			? [{ type: "paragraph", text: "Todavía no hay hogares registrados.", muted: true }]
			: [
					{
						type: "table",
						table: {
							sheetName: "Hogares",
							columns: [
								{ label: "Hogar", width: 2 },
								{ label: "Personas", width: 1, align: "center" },
								{ label: "Integrantes", width: 5 },
							],
							rows,
						},
					},
				];

	return { title: "Hogares", fileName: "hogares", blocks, footer: "Mi Congre" };
}

export async function buildGroups(ctx: BuilderContext): Promise<ReportDoc> {
	return ctx.params.get("kind") === "households" ? buildHouseholds(ctx) : buildServiceGroups(ctx);
}
