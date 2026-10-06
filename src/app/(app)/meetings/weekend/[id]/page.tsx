import { redirect } from "next/navigation";
import { WeekendDetail } from "@/components/meetings/weekend/WeekendDetail";
import { getSession } from "@/lib/auth/session";

export default async function WeekendMeetingPage({ params }: { params: Promise<{ id: string }> }) {
	const session = await getSession();
	if (session?.role !== "admin") redirect("/panel");

	const { id } = await params;
	return <WeekendDetail meetingId={id} />;
}
