// Tope mensual de horas de precursor regular: servicio + proyectos.
export const PIONEER_MONTHLY_CAP = 55;

/** Máximo de horas de proyecto posible dado lo que llevó de servicio (≤ 0 = no aplica). */
export function maxProjectHours(hours: number | null | undefined): number {
	return Math.round((PIONEER_MONTHLY_CAP - (hours ?? 0)) * 100) / 100;
}

/** Ajusta las horas de proyecto al máximo permitido; vacío (null) si no hay cupo o no hay valor. */
export function clampProjectHours(
	hours: number | null | undefined,
	projectHours: number | null | undefined,
): number | null {
	const max = maxProjectHours(hours);
	if (max <= 0 || !projectHours || projectHours <= 0) return null;
	return Math.min(projectHours, max);
}
