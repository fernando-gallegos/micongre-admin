import { MAX_ANIMATION_BYTES } from "./folders";

export type LottieCheck =
	| { ok: true; width: number; height: number; durationMs: number }
	| { ok: false; error: "too_large" | "not_json" | "not_lottie" };

/** Comprueba que el texto sea un Lottie (JSON) usable: tamaño, estructura mínima y duración. Los archivos .lottie (zip) no sirven:
 * en LottieFiles Creator se exporta como "Lottie JSON". */
export function checkLottie(text: string): LottieCheck {
	if (text.length > MAX_ANIMATION_BYTES) return { ok: false, error: "too_large" };
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { ok: false, error: "not_json" };
	}
	const d = data as { fr?: unknown; ip?: unknown; op?: unknown; w?: unknown; h?: unknown; layers?: unknown };
	const nums = [d?.fr, d?.ip, d?.op, d?.w, d?.h];
	if (!d || typeof d !== "object" || nums.some((n) => typeof n !== "number" || !Number.isFinite(n)) || !Array.isArray(d.layers)) {
		return { ok: false, error: "not_lottie" };
	}
	const fr = d.fr as number, ip = d.ip as number, op = d.op as number, w = d.w as number, h = d.h as number;
	if (fr <= 0 || op <= ip || w <= 0 || h <= 0) return { ok: false, error: "not_lottie" };
	return { ok: true, width: Math.round(w), height: Math.round(h), durationMs: Math.round(((op - ip) / fr) * 1000) };
}
