"use client";

import { SelectBox } from "@/components/ui/Input";
import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { InlineLoader } from "@/components/ui/Spinner";
import { APPOINTMENT_LABELS } from "@/lib/appointmentLabels";
import { printBulkTables } from "@/lib/publishers/bulkPdf";
import { SERVICE_COMMITTEE_APPOINTMENTS } from "@/lib/rbac/roles";

interface Person {
	id: string;
	fullName: string;
	gender: string | null;
	theocraticStatus: string;
	fieldServiceGroupId: string | null;
	locked: boolean;
	appointments: string[];
	privilegeIds: string[];
}
interface Loaded {
	canPrivileges: boolean;
	canAppointments: boolean;
	groups: { id: string; name: string }[];
	people: Person[];
}
interface PrivilegeOption {
	id: string;
	name: string;
	category: string;
}
interface Result {
	privilegesGranted: number;
	privilegesRevoked: number;
	appointmentsStarted: number;
	appointmentsEnded: number;
	skipped: { userId: string; reason: string }[];
	warnings: string[];
}
interface Column {
	key: string;
	label: string;
	committee?: boolean;
}

const COMMITTEE = SERVICE_COMMITTEE_APPOINTMENTS as readonly string[];
const FILTERS = [
	{ key: "all", label: "Todos" },
	{ key: "male", label: "Varones" },
	{ key: "female", label: "Mujeres" },
	{ key: "baptized", label: "Bautizados" },
	{ key: "elder", label: "Ancianos" },
	{ key: "ministerial_servant", label: "Siervos ministeriales" },
] as const;

/** Asignación masiva en matriz: personas a la izquierda (nombre fijo), privilegios o nombramientos arriba, una casilla por cruce.
 * Se marca o desmarca y "Guardar" aplica solo lo que cambió; el encabezado de cada columna marca o desmarca a todas las personas
 * mostradas. Cada mitad se habilita según el permiso de quien la usa. */
export function BulkAssign() {
	const [data, setData] = useState<Loaded | null>(null);
	const [catalog, setCatalog] = useState<PrivilegeOption[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
	const [groupId, setGroupId] = useState("");
	const [tab, setTab] = useState<"privileges" | "appointments">("privileges");
	// Valor deseado por cruce persona|elemento, solo donde difiere de lo vigente.
	const [privEdits, setPrivEdits] = useState<Record<string, boolean>>({});
	const [apptEdits, setApptEdits] = useState<Record<string, boolean>>({});
	const [confirming, setConfirming] = useState(false);
	const [saving, setSaving] = useState(false);
	const [result, setResult] = useState<Result | null>(null);

	async function load() {
		const res = await fetch("/api/publishers/bulk");
		if (!res.ok) {
			setError("No se pudo cargar la información.");
			return;
		}
		const json = (await res.json()) as Loaded;
		setData(json);
		setTab((t) => (t === "privileges" && !json.canPrivileges ? "appointments" : t === "appointments" && !json.canAppointments ? "privileges" : t));
		if (json.canPrivileges) {
			const cat = await fetch("/api/privileges");
			if (cat.ok) setCatalog(((await cat.json()) as { items: PrivilegeOption[] }).items);
		}
	}
	useEffect(() => {
		load();
	}, []);

	const filtered = useMemo(() => {
		if (!data) return [];
		const q = search.trim().toLowerCase();
		return data.people.filter((p) => {
			if (q && !p.fullName.toLowerCase().includes(q)) return false;
			if (groupId && p.fieldServiceGroupId !== groupId) return false;
			if (filter === "male") return p.gender === "male";
			if (filter === "female") return p.gender === "female";
			if (filter === "baptized") return p.theocraticStatus === "baptized_publisher";
			if (filter === "elder" || filter === "ministerial_servant") return p.appointments.includes(filter);
			return true;
		});
	}, [data, search, filter, groupId]);

	const columns: Column[] = useMemo(
		() =>
			tab === "privileges"
				? catalog.map((c) => ({ key: c.id, label: c.name }))
				: Object.entries(APPOINTMENT_LABELS).map(([type, label]) => ({ key: type, label, committee: COMMITTEE.includes(type) })),
		[tab, catalog],
	);
	const edits = tab === "privileges" ? privEdits : apptEdits;
	const setEdits = tab === "privileges" ? setPrivEdits : setApptEdits;

	function current(p: Person, key: string): boolean {
		return tab === "privileges" ? p.privilegeIds.includes(key) : p.appointments.includes(key);
	}
	function value(p: Person, key: string): boolean {
		const e = edits[`${p.id}|${key}`];
		return e === undefined ? current(p, key) : e;
	}

	/** Pone el valor de una casilla; si coincide con lo vigente, deja de ser un cambio. */
	function applyValue(next: Record<string, boolean>, p: Person, key: string, want: boolean) {
		if (want === current(p, key)) delete next[`${p.id}|${key}`];
		else next[`${p.id}|${key}`] = want;
	}

	function toggleCell(p: Person, col: Column) {
		if (p.locked) return;
		setEdits((prev) => {
			const next = { ...prev };
			const want = !value(p, col.key);
			applyValue(next, p, col.key, want);
			// Coordinador / secretario / superintendente de servicio: una sola persona; al marcar, se desmarca a las demás.
			if (want && col.committee && data) {
				for (const other of data.people) if (other.id !== p.id && value(other, col.key)) applyValue(next, other, col.key, false);
			}
			return next;
		});
	}

	/** Encabezado: si todas las personas mostradas lo tienen, se quita a todas; si no, se agrega a todas. */
	function toggleColumn(col: Column) {
		const rows = filtered.filter((p) => !p.locked);
		if (rows.length === 0 || (col.committee && rows.length > 1)) return;
		const allHave = rows.every((p) => value(p, col.key));
		setEdits((prev) => {
			const next = { ...prev };
			for (const p of rows) applyValue(next, p, col.key, !allHave);
			return next;
		});
	}

	const changeList = useMemo(() => {
		const byPerson = new Map<string, { userId: string; privileges: { add: string[]; remove: string[] }; appointments: { add: string[]; remove: string[] } }>();
		const entry = (userId: string) => {
			let e = byPerson.get(userId);
			if (!e) {
				e = { userId, privileges: { add: [], remove: [] }, appointments: { add: [], remove: [] } };
				byPerson.set(userId, e);
			}
			return e;
		};
		for (const [k, want] of Object.entries(privEdits)) {
			const [userId, key] = k.split("|");
			entry(userId).privileges[want ? "add" : "remove"].push(key);
		}
		for (const [k, want] of Object.entries(apptEdits)) {
			const [userId, key] = k.split("|");
			entry(userId).appointments[want ? "add" : "remove"].push(key);
		}
		return [...byPerson.values()].map((e) => ({
			userId: e.userId,
			...(e.privileges.add.length || e.privileges.remove.length ? { privileges: e.privileges } : {}),
			...(e.appointments.add.length || e.appointments.remove.length ? { appointments: e.appointments } : {}),
		}));
	}, [privEdits, apptEdits]);
	const privCount = Object.keys(privEdits).length;
	const apptCount = Object.keys(apptEdits).length;
	const total = privCount + apptCount;

	async function save() {
		setSaving(true);
		setError(null);
		const res = await fetch("/api/publishers/bulk", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ changes: changeList }),
		});
		setSaving(false);
		setConfirming(false);
		if (!res.ok) {
			const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
			setError(
				j?.error === "committee_single"
					? "Coordinador, secretario y superintendente de servicio solo pueden ser una persona."
					: (j?.message ?? "No se pudo guardar."),
			);
			return;
		}
		setResult((await res.json()) as Result);
		setPrivEdits({});
		setApptEdits({});
		load();
	}

	// PDF con las tablas de las personas mostradas (con lo ya guardado, sin los cambios pendientes).
	function exportPdf() {
		if (!data) return;
		const ok = printBulkTables({
			people: filtered,
			privileges: data.canPrivileges ? catalog.map((c) => ({ id: c.id, name: c.name })) : undefined,
			appointments: data.canAppointments ? Object.entries(APPOINTMENT_LABELS).map(([type, label]) => ({ type, label })) : undefined,
		});
		if (!ok) setError("No se pudo preparar el PDF.");
	}

	if (error && !data) return <p className="text-sm text-red-600">{error}</p>;
	if (!data) return <InlineLoader />;

	return (
		<div className="flex flex-col gap-4">
			{/* Barra fija: cambios pendientes, guardar y exportar */}
			<div className="sticky top-0 z-30 -mx-5 flex flex-wrap items-center gap-2 bg-bg/95 px-5 py-2 backdrop-blur md:-mx-10 md:px-10">
				<span className="mr-auto text-sm text-ink-soft">
					{total === 0 ? "Sin cambios" : `${total} ${total === 1 ? "cambio" : "cambios"} sin guardar`}
				</span>
				<Button
					variant="secondary"
					className="!min-h-10 !px-3"
					onClick={exportPdf}
					title="Tablas de privilegios y nombramientos en PDF (de las personas mostradas)"
				>
					<FileDown size={16} />
					<span className="hidden sm:inline">Exportar PDF</span>
				</Button>
				<Button
					variant="ghost"
					className="!min-h-10 !px-3"
					disabled={total === 0 || saving}
					onClick={() => {
						setPrivEdits({});
						setApptEdits({});
					}}
				>
					Descartar
				</Button>
				<Button className="!min-h-10" disabled={total === 0 || saving} onClick={() => setConfirming(true)}>
					Guardar
				</Button>
			</div>

			{error && <p className="text-sm text-red-600">{error}</p>}

			<input
				type="search"
				placeholder="Buscar por nombre"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				className="min-h-12 rounded-full bg-surface px-4 text-base text-ink focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
			/>
			<ChipGroup>
				{FILTERS.map((f) => (
					<Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
						{f.label}
					</Chip>
				))}
			</ChipGroup>
			<div className="flex flex-wrap items-center gap-2">
				{data.groups.length > 0 && (
					<SelectBox
						value={groupId}
						onChange={(e) => setGroupId(e.target.value)}
						className="min-h-11 rounded-2xl border border-border bg-surface px-3 text-sm text-ink"
					>
						<option value="">Todos los grupos</option>
						{data.groups.map((g) => (
							<option key={g.id} value={g.id}>
								{g.name}
							</option>
						))}
					</SelectBox>
				)}
				{data.canPrivileges && data.canAppointments && (
					<ChipGroup>
						<Chip active={tab === "privileges"} onClick={() => setTab("privileges")}>
							Privilegios{privCount ? ` · ${privCount}` : ""}
						</Chip>
						<Chip active={tab === "appointments"} onClick={() => setTab("appointments")}>
							Nombramientos{apptCount ? ` · ${apptCount}` : ""}
						</Chip>
					</ChipGroup>
				)}
			</div>
			{(!data.canPrivileges || !data.canAppointments) && (
				<p className="text-xs text-ink-soft">
					{data.canPrivileges ? "No tienes permiso para asignar nombramientos." : "No tienes permiso para asignar privilegios."}
				</p>
			)}

			{/* Matriz: la primera columna y el encabezado quedan fijos al desplazar */}
			<div className="max-h-[70vh] overflow-auto rounded-[20px] bg-surface">
				<table className="border-separate border-spacing-0 text-sm">
					<thead>
						<tr>
							<th className="sticky left-0 top-0 z-20 w-44 min-w-44 max-w-44 border-b border-r border-border bg-surface px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft sm:w-56 sm:min-w-56 sm:max-w-56">
								{filtered.length} personas
							</th>
							{columns.map((col) => (
								<th key={col.key} className="sticky top-0 z-10 h-40 w-11 min-w-11 border-b border-border bg-surface p-0 align-bottom">
									<button
										type="button"
										onClick={() => toggleColumn(col)}
										title="Marcar o desmarcar a todas las personas mostradas"
										className="mx-auto flex h-full w-full items-end justify-center pb-2 text-xs font-semibold text-ink hover:text-accent"
									>
										<span className="rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{col.label}</span>
									</button>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{filtered.map((p) => (
							<tr key={p.id} className={p.locked ? "opacity-50" : undefined}>
								<th
									scope="row"
									className="sticky left-0 z-10 w-44 min-w-44 max-w-44 truncate border-b border-r border-border bg-surface px-3 py-2 text-left font-medium text-ink sm:w-56 sm:min-w-56 sm:max-w-56"
									title={p.locked ? `${p.fullName} (administrador)` : p.fullName}
								>
									{p.fullName}
								</th>
								{columns.map((col) => {
									const on = value(p, col.key);
									const changed = edits[`${p.id}|${col.key}`] !== undefined;
									return (
										<td
											key={col.key}
											className={`h-11 w-11 min-w-11 border-b border-border p-0 text-center ${changed ? (on ? "bg-accent/20" : "bg-red-500/15") : ""}`}
										>
											<button
												type="button"
												disabled={p.locked}
												onClick={() => toggleCell(p, col)}
												aria-label={`${col.label}: ${p.fullName}`}
												aria-pressed={on}
												className="flex h-11 w-full items-center justify-center text-base disabled:cursor-not-allowed"
											>
												{on ? <span className={changed ? "text-accent" : "text-ink"}>✔</span> : changed ? <span className="text-red-600">✖</span> : null}
											</button>
										</td>
									);
								})}
							</tr>
						))}
						{filtered.length === 0 && (
							<tr>
								<td colSpan={columns.length + 1} className="px-4 py-6 text-center text-sm text-ink-soft">
									Nadie coincide con el filtro.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			<p className="text-xs text-ink-soft">
				Toca una casilla para marcarla o quitarla; el encabezado de cada columna marca o desmarca a todas las personas mostradas. Los cambios se aplican al guardar.
			</p>

			<Modal open={confirming} onClose={() => !saving && setConfirming(false)} title="Guardar cambios">
				<div className="flex flex-col gap-4">
					<p className="text-sm text-ink">
						Se aplicarán <span className="font-medium">{total}</span> {total === 1 ? "cambio" : "cambios"} a{" "}
						<span className="font-medium">{changeList.length}</span> {changeList.length === 1 ? "persona" : "personas"}
						{privCount > 0 && apptCount > 0 ? ` (${privCount} de privilegios y ${apptCount} de nombramientos)` : ""}.
					</p>
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>
							Cancelar
						</Button>
						<Button onClick={save} disabled={saving}>
							{saving ? "Guardando..." : "Confirmar"}
						</Button>
					</div>
				</div>
			</Modal>

			<Modal open={!!result} onClose={() => setResult(null)} title="Listo">
				{result && (
					<div className="flex flex-col gap-3 text-sm text-ink">
						<ul className="list-disc pl-5">
							{result.privilegesGranted > 0 && <li>Privilegios otorgados: {result.privilegesGranted}</li>}
							{result.privilegesRevoked > 0 && <li>Privilegios quitados: {result.privilegesRevoked}</li>}
							{result.appointmentsStarted > 0 && <li>Nombramientos agregados: {result.appointmentsStarted}</li>}
							{result.appointmentsEnded > 0 && <li>Nombramientos terminados: {result.appointmentsEnded}</li>}
							{result.privilegesGranted + result.privilegesRevoked + result.appointmentsStarted + result.appointmentsEnded === 0 && (
								<li>No hubo nada que cambiar.</li>
							)}
						</ul>
						{result.skipped.length > 0 && <p className="text-ink-soft">Omitidas: {result.skipped.length} (administradores o no encontradas).</p>}
						{result.warnings.map((w) => (
							<p key={w} className="text-ink-soft">
								{w}
							</p>
						))}
						<div className="flex justify-end">
							<Button onClick={() => setResult(null)}>Cerrar</Button>
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}
