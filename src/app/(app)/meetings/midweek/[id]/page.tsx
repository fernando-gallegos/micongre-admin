import { redirect } from "next/navigation";
import { WeekBuilder } from "@/components/meetings/midweek/WeekBuilder";
import { getSession } from "@/lib/auth/session";

export default async function MidweekMeetingPage({ params }: { params: Promise<{ id: string }> }) {
	const session = await getSession();
	if (session?.role !== "admin") redirect("/panel");

	const { id } = await params;
	return <WeekBuilder meetingId={id} />;
}
