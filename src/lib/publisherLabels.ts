export const CONGREGATION_STATUS_LABELS: Record<string, string> = {
	active: "Activo",
	inactive: "Inactivo",
	irregular: "Irregular",
	disfellowshipped: "Sacado",
};

export const THEOCRATIC_STATUS_LABELS: Record<string, string> = {
	student: "Estudiante",
	unbaptized_publisher: "Publicador no bautizado",
	baptized_publisher: "Publicador bautizado",
};

export interface AppointmentBadge {
	code: string;
	name: string;
	tone: "success" | "warning" | "neutral";
}

const LEADERSHIP_BADGES: Record<string, AppointmentBadge> = {
	elder: { code: "AC", name: "Anciano", tone: "success" },
	ministerial_servant: { code: "SM", name: "Siervo Ministerial", tone: "success" },
};

const PIONEER_BADGES: Record<string, AppointmentBadge> = {
	regular_pioneer: { code: "PR", name: "Precursor Regular", tone: "warning" },
	auxiliary_pioneer: { code: "PA", name: "Precursor Auxiliar", tone: "warning" },
};

const PUBLISHER_BADGE: AppointmentBadge = { code: "P", name: "Publicador", tone: "neutral" };

/** Insignias de nombramiento a partir de los tipos activos de un publicador
 * (elder/ministerial_servant/regular_pioneer/auxiliary_pioneer) — anciano o
 * siervo ministerial se combina con precursor regular o auxiliar (p. ej.
 * "AC PR"); sin nombramiento de liderazgo, un precursor muestra solo su
 * insignia de precursor (no "P PR"); sin ninguno, "P" solo. */
export function getAppointmentBadges(activeAppointmentTypes: Iterable<string>): AppointmentBadge[] {
	const types = new Set(activeAppointmentTypes);
	const leadership = types.has("elder")
		? LEADERSHIP_BADGES.elder
		: types.has("ministerial_servant")
			? LEADERSHIP_BADGES.ministerial_servant
			: null;
	const pioneer = types.has("regular_pioneer")
		? PIONEER_BADGES.regular_pioneer
		: types.has("auxiliary_pioneer")
			? PIONEER_BADGES.auxiliary_pioneer
			: null;

	const badges = [leadership, pioneer].filter((b): b is AppointmentBadge => !!b);
	return badges.length > 0 ? badges : [PUBLISHER_BADGE];
}
