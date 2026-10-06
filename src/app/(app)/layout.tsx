import { redirect } from "next/navigation";
import { SessionKeepAlive } from "@/components/auth/SessionKeepAlive";
import { BottomNav } from "@/components/layout/BottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const session = await getSession();
	if (!session) redirect("/login");

	const [me] = await getDb()
		.select({ navShortcut: users.navShortcut })
		.from(users)
		.where(eq(users.id, session.userId))
		.limit(1);

	return (
		<div className="flex min-h-dvh">
			<SessionKeepAlive />
			<Sidebar role={session.role} privilegeCodes={session.privilegeCodes} fullName={session.fullName} />
			<div className="flex min-w-0 flex-1 flex-col print:block">
				<main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-[calc(72px+env(safe-area-inset-bottom)+88px)] pt-7 md:px-10 md:pb-16 md:pt-10 print:max-w-none print:p-0">
					{children}
				</main>
			</div>
			<BottomNav role={session.role} privilegeCodes={session.privilegeCodes} shortcut={me?.navShortcut ?? null} />
		</div>
	);
}
