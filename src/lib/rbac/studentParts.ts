// Reglas del folleto S-38 para cada título de "parte de estudiante" de la
// sección Seamos mejores maestros — hoy todas comparten un único
// sectionType ("student_assignment") y un único privilegio sin restricción
// de sexo, así que esta tabla es el único lugar donde se distingue una de
// otra.
//
// Se compara por palabra clave, no por texto exacto: la Guía de
// actividades cambia de conjugación entre revisiones (p. ej. "Empecemos
// conversaciones" del folleto S-38 vs. "Empiece conversaciones" de la
// edición 2026) — depender del texto exacto rompía la regla en silencio.
// Se evalúa en orden, gana la primera que matchee.
//
// "Lectura de la Biblia" NO está aquí: tiene su propio sectionType
// ("bible_reading") con privilegio propio (priv_bible_reading,
// requires_male=1), ya restringido sin pasar por esta tabla.
export interface StudentPartRule {
	requiresMale: boolean;
	hasHelper: boolean;
}

const STUDENT_PART_RULES: { label: string; pattern: RegExp; rule: StudentPartRule }[] = [
	{ label: "Empiece conversaciones", pattern: /conversaci/i, rule: { requiresMale: false, hasHelper: true } }, // S-38 §7
	{ label: "Haga revisitas", pattern: /revisita/i, rule: { requiresMale: false, hasHelper: true } }, // §8
	{ label: "Haga discípulos", pattern: /disc[ií]pulos/i, rule: { requiresMale: false, hasHelper: true } }, // §10
	{ label: "Explique sus creencias", pattern: /creencias/i, rule: { requiresMale: true, hasHelper: false } }, // §11
	{ label: "¿Qué diría?", pattern: /qu[ée]\s+dir/i, rule: { requiresMale: false, hasHelper: false } }, // §9 — no es una parte de estudiante real, sin ayudante
	{ label: "Discurso", pattern: /^discurso$/i, rule: { requiresMale: true, hasHelper: false } }, // §12 — distinto del "Discurso" de Tesoros de la Biblia
];

// Parte agregada a mano, aún sin clasificar (sectionTitle null) — permisivo,
// para no romper el flujo existente de "Agregar parte de estudiante".
const DEFAULT_RULE: StudentPartRule = { requiresMale: false, hasHelper: true };

export function getStudentPartRule(title: string | null | undefined): StudentPartRule {
	if (!title) return DEFAULT_RULE;
	const trimmed = title.trim();
	return STUDENT_PART_RULES.find((r) => r.pattern.test(trimmed))?.rule ?? DEFAULT_RULE;
}

export const STUDENT_PART_TITLES = STUDENT_PART_RULES.map((r) => r.label);
