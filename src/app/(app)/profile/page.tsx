import { redirect } from "next/navigation";
import { DeleteAccountCard } from "@/components/auth/DeleteAccountCard";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { PushToggle } from "@/components/panel/PushToggle";
import { AppearanceCard } from "@/components/theme/AppearanceCard";
import { ShortcutPicker } from "@/components/layout/ShortcutPicker";
import { PageHeader, SectionLabel } from "@/components/ui/Layout";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";

export default async function ProfilePage() {
	const session = await getSession();
	if (!session) redirect("/login");

	const [me] = await getDb()
		.select({ navShortcut: users.navShortcut })
		.from(users)
		.where(eq(users.id, session.userId))
		.limit(1);

	return (
		<div className="mx-auto flex max-w-xl flex-col gap-6">
			<PageHeader title="Mi perfil" subtitle="Tu apariencia, avisos y datos de acceso." />
			<section>
				<SectionLabel>Apariencia</SectionLabel>
				<AppearanceCard />
			</section>
			<section className="md:hidden">
				<SectionLabel>Acceso directo</SectionLabel>
				<ShortcutPicker role={session.role} privilegeCodes={session.privilegeCodes} current={me?.navShortcut ?? null} />
			</section>
			<section>
				<SectionLabel>Avisos</SectionLabel>
				<PushToggle />
			</section>
			<section>
				<SectionLabel>Cuenta</SectionLabel>
				<ProfileForm />
			</section>
			<section>
				<SectionLabel>Eliminar cuenta</SectionLabel>
				<DeleteAccountCard />
			</section>
		</div>
	);
}
