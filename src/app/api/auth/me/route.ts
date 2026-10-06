import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { and, isNull } from "drizzle-orm";
import { theocraticAppointments, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getActivePrivilegeCodes } from "@/lib/rbac/eligibility";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export async function GET() {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

	const db = getDb();
	const [user] = await db
		.select({
			id: users.id,
			fullName: users.fullName,
			username: users.username,
			systemRole: users.systemRole,
			fieldServiceGroupId: users.fieldServiceGroupId,
			navShortcut: users.navShortcut,
		})
		.from(users)
		.where(eq(users.id, session.userId))
		.limit(1);

	if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

	// Nombramientos vigentes (la app móvil los usa para saber, por ejemplo, si es anciano).
	const appointmentTypes = (
		await db
			.select({ type: theocraticAppointments.appointmentType })
			.from(theocraticAppointments)
			.where(and(eq(theocraticAppointments.userId, session.userId), isNull(theocraticAppointments.endDate)))
	).map((a) => a.type);

	// Privilegios vigentes en este momento (nombramientos y permisos asignados en la web), no los del token, que puede
	// tener hasta 15 min de antigüedad: así la app móvil refleja de inmediato los cambios.
	const privilegeCodes = await getActivePrivilegeCodes(db, session.userId);

	return NextResponse.json({ ...user, privilegeCodes, appointmentTypes });
}

const updateMeSchema = z.object({
	fullName: z.string().trim().min(1).max(200).optional(),
	username: z
		.string()
		.trim()
		.min(3)
		.max(50)
		.regex(/^[a-zA-Z0-9._-]+$/, "El usuario solo puede tener letras, números, puntos, guiones y guiones bajos.")
		.optional(),
	currentPassword: z.string().min(1).optional(),
	newPassword: z.string().min(6).optional(),
});

// "Mi cuenta" → nombre, usuario y/o contraseña. Cambiar usuario o contraseña
// exige la contraseña actual (son las credenciales de acceso); el nombre no,
// es solo un dato de perfil. El fullName vive también en el access token
// (ver jwt.ts), así que el cliente debe pedir POST /api/auth/refresh justo
// después de un PATCH exitoso para que la sesión se actualice sin re-login —
// ver ProfileModal.tsx.
export async function PATCH(request: Request) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

	const parsed = updateMeSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
	const { fullName, username, currentPassword, newPassword } = parsed.data;

	const db = getDb();
	const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
	if (!user?.passwordHash) return NextResponse.json({ error: "not_found" }, { status: 404 });

	const usernameChanging = username !== undefined && username !== user.username;
	if ((usernameChanging || newPassword) && !currentPassword) {
		return NextResponse.json({ error: "current_password_required" }, { status: 400 });
	}

	if (currentPassword) {
		const validCurrent = await verifyPassword(currentPassword, user.passwordHash);
		if (!validCurrent) return NextResponse.json({ error: "invalid_current_password" }, { status: 401 });
	}

	if (usernameChanging) {
		const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
		if (existing) return NextResponse.json({ error: "username_taken" }, { status: 409 });
	}

	const updates: { fullName?: string; username?: string; passwordHash?: string; updatedAt: Date } = {
		updatedAt: new Date(),
	};
	if (fullName) updates.fullName = fullName;
	if (username) updates.username = username;
	if (newPassword) updates.passwordHash = await hashPassword(newPassword);

	await db.update(users).set(updates).where(eq(users.id, user.id));

	return NextResponse.json({ ok: true, fullName: fullName ?? user.fullName, username: username ?? user.username });
}
