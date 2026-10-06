import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

// middleware.ts ya exige sesión para "/", así que si llegamos aquí es porque
// hay sesión válida — pero igual se revalida por si acaso.
export default async function RootPage() {
	const session = await getSession();
	redirect(session ? "/panel" : "/login");
}
