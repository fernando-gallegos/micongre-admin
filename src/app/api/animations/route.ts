import { count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { welcomeAnimations } from "@/db/schema";
import { errorResponse } from "@/lib/api/errors";
import { ANIMATION_FOLDERS, MAX_ANIMATIONS_PER_FOLDER, type AnimationFolder } from "@/lib/animations/folders";
import { checkLottie } from "@/lib/animations/validate";
import { getSession } from "@/lib/auth/session";
import { assertCanAccessCongregationModule } from "@/lib/rbac/guards";

// Animaciones de bienvenida (Lottie JSON), gestionadas desde Congregación sin desplegar. Los listados nunca traen el JSON.
export async function GET() {
	try {
		assertCanAccessCongregationModule(await getSession());
		const items = await getDb()
			.select({
				id: welcomeAnimations.id,
				folder: welcomeAnimations.folder,
				name: welcomeAnimations.name,
				size: welcomeAnimations.size,
				width: welcomeAnimations.width,
				height: welcomeAnimations.height,
				durationMs: welcomeAnimations.durationMs,
				createdAt: welcomeAnimations.createdAt,
			})
			.from(welcomeAnimations)
			.orderBy(desc(welcomeAnimations.createdAt));
		return NextResponse.json({ items });
	} catch (error) {
		return errorResponse(error);
	}
}

interface UploadResult {
	file: string;
	ok: boolean;
	error?: "not_json_file" | "lottie_zip" | "too_large" | "not_json" | "not_lottie" | "folder_full";
}

// Sube uno o varios archivos .json a una carpeta (multipart: `folder` y `files`).
export async function POST(request: Request) {
	try {
		const session = await getSession();
		assertCanAccessCongregationModule(session);
		const form = await request.formData().catch(() => null);
		const folder = form?.get("folder");
		if (!form || typeof folder !== "string" || !(ANIMATION_FOLDERS as readonly string[]).includes(folder)) {
			return NextResponse.json({ error: "invalid_folder" }, { status: 400 });
		}
		const files = form.getAll("files").filter((f): f is File => f instanceof File);
		if (files.length === 0) return NextResponse.json({ error: "no_files" }, { status: 400 });

		const db = getDb();
		const [{ n }] = await db.select({ n: count() }).from(welcomeAnimations).where(eq(welcomeAnimations.folder, folder as AnimationFolder));
		let used = n;
		const results: UploadResult[] = [];
		for (const file of files) {
			const lower = file.name.toLowerCase();
			if (lower.endsWith(".lottie")) {
				results.push({ file: file.name, ok: false, error: "lottie_zip" });
				continue;
			}
			if (!lower.endsWith(".json")) {
				results.push({ file: file.name, ok: false, error: "not_json_file" });
				continue;
			}
			if (used >= MAX_ANIMATIONS_PER_FOLDER) {
				results.push({ file: file.name, ok: false, error: "folder_full" });
				continue;
			}
			const text = await file.text();
			const check = checkLottie(text);
			if (!check.ok) {
				results.push({ file: file.name, ok: false, error: check.error });
				continue;
			}
			await db.insert(welcomeAnimations).values({
				folder: folder as AnimationFolder,
				name: file.name.replace(/\.json$/i, "").trim().slice(0, 80) || "Animación",
				data: text,
				size: text.length,
				width: check.width,
				height: check.height,
				durationMs: check.durationMs,
				createdByUserId: session.userId,
			});
			used++;
			results.push({ file: file.name, ok: true });
		}
		return NextResponse.json({ results });
	} catch (error) {
		return errorResponse(error);
	}
}
