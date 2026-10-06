import { asc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { midweekAssignments, midweekMeetings, users } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { getSession } from "@/lib/auth/session";
import { formatLongDate } from "@/lib/dateFormat";
import { buildS89Slips } from "@/lib/s89";

export default async function MidweekNotifyPage({ params }: { params: Promise<{ id: string }> }) {
	const session = await getSession();
	if (session?.role !== "admin") redirect("/panel");

	const { id } = await params;
	const db = getDb();

	const [meeting] = await db.select().from(midweekMeetings).where(eq(midweekMeetings.id, id)).limit(1);
	if (!meeting) notFound();

	const rows = await db
		.select()
		.from(midweekAssignments)
		.where(eq(midweekAssignments.meetingId, id))
		.orderBy(asc(midweekAssignments.sequenceOrder));

	const userIds = Array.from(
		new Set(rows.flatMap((r) => [r.mainAssigneeId, r.assistantAssigneeId]).filter((v): v is string => !!v)),
	);
	const relatedUsers = userIds.length
		? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds))
		: [];
	const nameById = new Map(relatedUsers.map((u) => [u.id, u.fullName]));

	const slips = buildS89Slips(
		meeting,
		rows.map((r) => ({
			id: r.id,
			sectionType: r.sectionType,
			sectionTitle: r.sectionTitle,
			mainAssigneeName: r.mainAssigneeId ? (nameById.get(r.mainAssigneeId) ?? null) : null,
			assistantAssigneeName: r.assistantAssigneeId ? (nameById.get(r.assistantAssigneeId) ?? null) : null,
		})),
	);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader title="Notificaciones S-89" subtitle={formatLongDate(meeting.meetingDate)} />
			<p className="text-sm text-ink-soft">
				Una papeleta por publicador con una asignación. Imprime esta página o comparte cada
				recuadro individualmente.
			</p>

			{slips.length === 0 && (
				<Card>
					<p className="text-sm text-ink-soft">Todavía no hay nadie asignado en esta reunión.</p>
				</Card>
			)}

			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{slips.map((slip) => (
					<Card key={slip.assignmentId} className="border-2">
						<p className="text-xs uppercase tracking-wide text-ink-soft">Asignación — S-89</p>
						<p className="mt-1 text-lg font-semibold text-ink">{slip.publisherName}</p>
						<p className="text-sm text-ink-soft">
							{slip.sectionLabel}
							{slip.sectionTitle && ` — ${slip.sectionTitle}`}
						</p>
						{slip.assistantName && (
							<p className="mt-1 text-sm text-ink-soft">Ayudante: {slip.assistantName}</p>
						)}
						<p className="mt-3 text-sm font-medium text-ink">
							{slip.weekLabel ?? formatLongDate(slip.meetingDate)}
						</p>
					</Card>
				))}
			</div>
		</div>
	);
}
