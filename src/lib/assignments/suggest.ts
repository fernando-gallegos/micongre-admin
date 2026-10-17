// Motor PURO de la asignación automática: dadas las casillas vacías de una reunión, los elegibles de cada privilegio y las estadísticas de los últimos
// 3 meses, propone a una persona por casilla (y deja la lista de candidatos con sus números). No toca la base: lo arman los endpoints.
//
// Quién está «disponible» para una casilla: es elegible para ese privilegio, no tiene otra asignación en esa reunión (ni se propuso ya en esta corrida) y,
// en partes de estudiante, cumple el sexo de la parte y la pareja del ayudante (S-38). Quien tiene algo ese día solo en OTRO módulo (p. ej. una tarea
// operativa mientras se arma el programa) queda como último recurso, marcado.
//
// Orden de los candidatos: (1) menos veces con ESA asignación en 3 meses, (2) menor carga total en 3 meses, (3) la última vez con esa asignación más
// antigua (nunca = primero), (4) nombre — determinista, sin azar.
import { isValidAssistantPairing, type EligibleUser } from "@/lib/rbac/eligibility";
import type { UserStats } from "./stats";

export interface SlotSpec {
	key: string;
	label: string;
	/** Agrupa filas en la vista previa (p. ej. «Tesoros de la Biblia»). */
	group?: string;
	privilegeId: string;
	typeKey: string;
	/** Solo hombres (partes de estudiante como «Discurso» o «Explique sus creencias»). */
	maleOnly?: boolean;
	/** Ayudante: debe formar pareja (mismo sexo o mismo hogar) con el principal, ya sea otra casilla de esta corrida o una persona ya asignada. */
	helperOf?: { slotKey?: string; userId?: string };
	/** Si alguien con este nombramiento vigente es candidato, solo se consideran ellos (p. ej. conductor de La Atalaya: no se rota al azar). */
	preferAppointment?: string;
}

export interface Candidate {
	id: string;
	name: string;
	/** Veces con esta misma asignación en la ventana. */
	count: number;
	/** Última vez con esta asignación en la ventana (AAAA-MM-DD). */
	last: string | null;
	/** Asignaciones de cualquier tipo en la ventana. */
	load: number;
	/** Ya tiene otra asignación ese día en otro módulo. */
	busy?: boolean;
}

export interface SlotProposal {
	key: string;
	label: string;
	group?: string;
	suggestion: Candidate | null;
	candidates: Candidate[];
	note?: string;
}

export interface ProposeInput {
	slots: SlotSpec[];
	eligible: (privilegeId: string) => EligibleUser[];
	stats: Map<string, UserStats>;
	/** Ya tienen algo en esta reunión dentro del mismo módulo: no se proponen. */
	hardBusy: Iterable<string>;
	/** Ya tienen algo ese día pero en otro módulo: último recurso. */
	softBusy?: Iterable<string>;
	/** Datos de una persona ya asignada (para emparejar al ayudante con un principal existente). */
	person: (id: string) => { gender: string; householdId: string | null } | undefined;
	/** Personas con un nombramiento vigente (para `preferAppointment`). */
	appointmentHolders?: (appointmentType: string) => Set<string>;
	/** Tope de candidatos devueltos por casilla (la propuesta siempre es el primero). */
	maxCandidates?: number;
}

function rank(slot: SlotSpec, stats: Map<string, UserStats>, people: EligibleUser[], busy: Set<string>): Candidate[] {
	const candidates = people.map((p): Candidate => {
		const user = stats.get(p.id);
		const type = user?.byType.get(slot.typeKey);
		return { id: p.id, name: p.fullName, count: type?.count ?? 0, last: type?.last ?? null, load: user?.load ?? 0, ...(busy.has(p.id) ? { busy: true } : {}) };
	});
	return candidates.sort(
		(a, b) =>
			Number(!!a.busy) - Number(!!b.busy) ||
			a.count - b.count ||
			a.load - b.load ||
			(a.last ?? "").localeCompare(b.last ?? "") ||
			a.name.localeCompare(b.name, "es"),
	);
}

export function proposeAssignments(input: ProposeInput): SlotProposal[] {
	const { slots, eligible, stats, person, appointmentHolders } = input;
	const max = input.maxCandidates ?? 12;
	const hard = new Set(input.hardBusy);
	const soft = new Set(input.softBusy ?? []);
	const chosenBySlot = new Map<string, string>();
	const proposals = new Map<string, SlotProposal>();

	const poolOf = (slot: SlotSpec): EligibleUser[] => {
		let pool = eligible(slot.privilegeId);
		if (slot.maleOnly) pool = pool.filter((p) => p.gender === "male");
		if (slot.preferAppointment && appointmentHolders) {
			const holders = appointmentHolders(slot.preferAppointment);
			const preferred = pool.filter((p) => holders.has(p.id));
			if (preferred.length > 0) pool = preferred;
		}
		return pool;
	};

	// Principales primero (las casillas con menos candidatos antes, para no dejarlas sin nadie); los ayudantes al final, cuando ya hay principal.
	const independent = slots.filter((s) => !s.helperOf).map((s) => ({ s, size: poolOf(s).length }));
	independent.sort((a, b) => a.size - b.size);
	const helpers = slots.filter((s) => s.helperOf);

	const resolve = (slot: SlotSpec) => {
		let pool = poolOf(slot);
		let note: string | undefined;
		if (slot.helperOf) {
			const mainId = slot.helperOf.userId ?? (slot.helperOf.slotKey ? chosenBySlot.get(slot.helperOf.slotKey) : undefined);
			const main = mainId
				? (pool.find((p) => p.id === mainId) ?? person(mainId) ?? (eligible(slot.privilegeId).find((p) => p.id === mainId) ?? undefined))
				: undefined;
			if (!mainId || !main) {
				proposals.set(slot.key, { key: slot.key, label: slot.label, group: slot.group, suggestion: null, candidates: [], note: "Primero hace falta la persona principal." });
				return;
			}
			pool = pool.filter((p) => p.id !== mainId && isValidAssistantPairing({ gender: main.gender, householdId: main.householdId }, p));
		}
		const free = pool.filter((p) => !hard.has(p.id));
		if (free.length === 0) note = pool.length === 0 ? "Nadie elegible para esta asignación." : "Todos los elegibles ya tienen otra asignación en esta reunión.";
		const candidates = rank(slot, stats, free, soft).slice(0, max);
		const suggestion = candidates[0] ?? null;
		if (suggestion) {
			chosenBySlot.set(slot.key, suggestion.id);
			hard.add(suggestion.id);
			if (suggestion.busy) note = "Ya tiene otra asignación ese día (en otro módulo); no había otra persona libre.";
		}
		proposals.set(slot.key, { key: slot.key, label: slot.label, group: slot.group, suggestion, candidates, note });
	};

	for (const { s } of independent) resolve(s);
	for (const s of helpers) resolve(s);
	return slots.map((s) => proposals.get(s.key)!);
}
