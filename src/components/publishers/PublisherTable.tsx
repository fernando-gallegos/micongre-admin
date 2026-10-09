"use client";

import { SelectBox } from "@/components/ui/Input";
import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowDown, ArrowUp, Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/Card";
import { ExportButton } from "@/components/export/ExportButton";
import { Avatar, Chip, ChipGroup, Fab, IconButton, List, PageHeader } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { AppointmentBadges } from "./AppointmentBadges";
import { AppointmentsCard } from "./AppointmentsCard";
import { DeletePublisherButton } from "./DeletePublisherButton";
import { EditPublisherForm, type PublisherData } from "./EditPublisherForm";
import { PrivilegesCard } from "./PrivilegesCard";
import { S21Button } from "./S21Button";
import { CONGREGATION_STATUS_LABELS, getAppointmentBadges } from "@/lib/publisherLabels";
import { PublisherForm } from "./PublisherForm";
import { PageLoader } from "@/components/ui/Spinner";

interface Appointment {
	id: string;
	appointmentType: string;
	startDate: string;
	endDate: string | null;
}

interface GrantedPrivilege {
	id: string;
	privilegeId: string;
	code: string;
	name: string;
	active: boolean;
}

interface PublisherRow extends PublisherData {
	username: string | null;
	accountStatus: string;
	fieldServiceGroupId: string | null;
	appointments: Appointment[];
	privileges: GrantedPrivilege[];
	serviceYearHours: number | null;
}

function activeAppointmentTypes(row: PublisherRow): string[] {
	return row.appointments.filter((a) => !a.endDate).map((a) => a.appointmentType);
}

interface GroupOption {
	id: string;
	name: string;
	color: string | null;
}

const ACCOUNT_STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "success" | "warning" }> = {
	no_account: { label: "Sin cuenta", tone: "neutral" },
	invited: { label: "Invitado", tone: "warning" },
	active: { label: "Con acceso", tone: "success" },
	disabled: { label: "Deshabilitado", tone: "neutral" },
};

const GENDER_LABEL: Record<string, string> = { male: "Varón", female: "Mujer" };

const STATUS_FILTERS = [
	{ key: "all", label: "Todos" },
	{ key: "active", label: "Activos" },
	{ key: "irregular", label: "Irregulares" },
	{ key: "inactive", label: "Inactivos" },
	{ key: "disfellowshipped", label: "Sacados" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

type SortKey =
	| "fullName"
	| "gender"
	| "phone"
	| "congregationStatus"
	| "progress"
	| "group"
	| "accountStatus"
	| "privilege";
type SortDir = "asc" | "desc";

interface Column {
	key: SortKey;
	label: string;
}

// Criterios de orden. "Progreso" (horas del año de servicio) solo se agrega,
// entre Condición y Grupo, para quien puede verla (superintendente de servicio o admin).
const COLUMNS_BEFORE_PROGRESS: Column[] = [
	{ key: "fullName", label: "Nombre" },
	{ key: "gender", label: "Sexo" },
	{ key: "phone", label: "Teléfono" },
	{ key: "congregationStatus", label: "Condición" },
];
const COLUMNS_AFTER_PROGRESS: Column[] = [
	{ key: "group", label: "Grupo" },
	{ key: "accountStatus", label: "Cuenta" },
	{ key: "privilege", label: "Nombramiento" },
];

export function PublisherTable({
	isAdmin,
	canEditGroup,
	canManageAppointments,
	canAdministerAccounts,
	canViewPrivileges,
	s21Scope,
	canDelete,
}: {
	isAdmin: boolean;
	// Admin o "Todos los publicadores": puede reasignar el grupo de servicio.
	canEditGroup: boolean;
	canManageAppointments: boolean;
	canAdministerAccounts: boolean;
	// Anciano o quien administra cuentas: ve los privilegios (solo lectura si no administra cuentas).
	canViewPrivileges: boolean;
	// Publicadores cuya S-21 se puede abrir: todos, o solo los de estos grupos.
	s21Scope: { all: boolean; groupIds: string[] };
	canDelete: boolean;
}) {
	const [rows, setRows] = useState<PublisherRow[]>([]);
	const [canViewProgress, setCanViewProgress] = useState(false);
	const [groups, setGroups] = useState<GroupOption[]>([]);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [showHidden, setShowHidden] = useState(false);
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [sortKey, setSortKey] = useState<SortKey>("fullName");
	const [sortDir, setSortDir] = useState<SortDir>("asc");

	const load = useCallback(async (includeHidden: boolean) => {
		setLoading(true);

		const allItems: PublisherRow[] = [];
		let cursor: number | null = 0;
		let progressVisible = false;
		while (cursor !== null) {
			const params = new URLSearchParams({ cursor: String(cursor) });
			if (includeHidden) params.set("includeHidden", "true");
			const res = await fetch(`/api/publishers?${params.toString()}`);
			if (!res.ok) break;
			const body = (await res.json()) as {
				items: PublisherRow[];
				nextCursor: number | null;
				canViewProgress: boolean;
			};
			allItems.push(...body.items);
			progressVisible = body.canViewProgress;
			cursor = body.nextCursor;
		}
		setRows(allItems);
		setCanViewProgress(progressVisible);

		const groupsRes = await fetch("/api/field-service-groups");
		if (groupsRes.ok) {
			const body = (await groupsRes.json()) as { items: GroupOption[] };
			setGroups(body.items);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		load(showHidden);
	}, [load, showHidden]);

	const groupName = useCallback(
		(id: string | null) => (id ? (groups.find((g) => g.id === id)?.name ?? "—") : "—"),
		[groups],
	);
	const groupFor = useCallback((id: string | null) => (id ? (groups.find((g) => g.id === id) ?? null) : null), [groups]);

	// Valores de búsqueda por fila: todas las columnas visibles, más el
	// usuario (no es columna pero es como la gente identifica su propia
	// cuenta) — todo excepto la columna de Acciones, que no tiene texto.
	const searchValuesFor = useCallback(
		(row: PublisherRow): string[] => [
			row.fullName,
			row.username ?? "",
			GENDER_LABEL[row.gender] ?? row.gender,
			row.phone ?? "",
			CONGREGATION_STATUS_LABELS[row.congregationStatus] ?? row.congregationStatus,
			groupName(row.fieldServiceGroupId),
			ACCOUNT_STATUS_LABEL[row.accountStatus]?.label ?? row.accountStatus,
			...getAppointmentBadges(activeAppointmentTypes(row)).flatMap((b) => [b.code, b.name]),
		],
		[groupName],
	);

	// Los administradores ocultos nunca cuentan como Publicador — se excluyen de
	// conteos y del filtro por condición, aunque el toggle "Mostrar
	// administradores ocultos" los traiga a la tabla para poder gestionarlos.
	const publisherRows = useMemo(
		() => rows.filter((row) => !row.isHiddenAdmin && row.congregationStatus !== "disfellowshipped"),
		[rows],
	);

	const statusFilteredRows = useMemo(() => {
		// Los sacados no cuentan: solo aparecen en su propio filtro.
		if (statusFilter === "all") return rows.filter((row) => row.congregationStatus !== "disfellowshipped");
		return rows.filter((row) => row.isHiddenAdmin || row.congregationStatus === statusFilter);
	}, [rows, statusFilter]);

	const statusCounts = useMemo(() => {
		const counts: Record<StatusFilter, number> = { all: publisherRows.length, active: 0, irregular: 0, inactive: 0, disfellowshipped: 0 };
		for (const row of rows) if (!row.isHiddenAdmin && row.congregationStatus === "disfellowshipped") counts.disfellowshipped++;
		for (const row of publisherRows) {
			if (row.congregationStatus === "active") counts.active++;
			else if (row.congregationStatus === "irregular") counts.irregular++;
			else if (row.congregationStatus === "inactive") counts.inactive++;
		}
		return counts;
	}, [publisherRows, rows]);

	const filteredRows = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return statusFilteredRows;
		return statusFilteredRows.filter((row) => searchValuesFor(row).some((value) => value.toLowerCase().includes(term)));
	}, [statusFilteredRows, search, searchValuesFor]);

	function toggleSort(key: SortKey) {
		if (key === sortKey) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	}

	const sortedRows = useMemo(() => {
		const valueFor = (row: PublisherRow): string => {
			switch (sortKey) {
				case "fullName":
					return row.fullName;
				case "gender":
					return GENDER_LABEL[row.gender] ?? row.gender;
				case "phone":
					return row.phone ?? "";
				case "congregationStatus":
					return CONGREGATION_STATUS_LABELS[row.congregationStatus] ?? row.congregationStatus;
				case "group":
					return groupName(row.fieldServiceGroupId);
				case "accountStatus":
					return ACCOUNT_STATUS_LABEL[row.accountStatus]?.label ?? row.accountStatus;
				case "privilege":
					return getAppointmentBadges(activeAppointmentTypes(row))
						.map((b) => b.code)
						.join(" ");
				case "progress":
					return "";
			}
		};
		const sorted = [...filteredRows].sort((a, b) => {
			if (sortKey === "progress") return (a.serviceYearHours ?? -1) - (b.serviceYearHours ?? -1);
			return valueFor(a).localeCompare(valueFor(b), "es");
		});
		return sortDir === "asc" ? sorted : sorted.reverse();
	}, [filteredRows, sortKey, sortDir, groupName]);

	const columns = useMemo(
		() => [
			...COLUMNS_BEFORE_PROGRESS,
			...(canViewProgress ? [{ key: "progress" as const, label: "Progreso" }] : []),
			...COLUMNS_AFTER_PROGRESS,
		],
		[canViewProgress],
	);

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Personas"
				subtitle={`${publisherRows.length} personas en la congregación`}
				actions={
					canManageAppointments || canAdministerAccounts ? (
						<Link
							href="/publishers/bulk"
							className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-alt"
						>
							<Users size={18} />
							Asignación masiva
						</Link>
					) : undefined
				}
			/>

			<div className="flex h-12 items-center gap-3 rounded-full bg-surface px-4 text-ink-soft focus-within:ring-1 focus-within:ring-accent">
				<Search size={20} className="shrink-0" />
				<input
					type="search"
					aria-label="Buscar por nombre"
					placeholder="Buscar por nombre"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="h-full min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-soft focus:outline-none sm:text-sm"
				/>
			</div>

			<ChipGroup>
				{STATUS_FILTERS.map((f) => (
					<Chip key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
						{f.label} · {statusCounts[f.key]}
					</Chip>
				))}
				<Chip active={showHidden} onClick={() => setShowHidden((v) => !v)}>
					Administradores ocultos
				</Chip>
			</ChipGroup>

			<div className="flex items-center gap-1">
				<label className="flex items-center gap-2 text-[13px] text-ink-soft">
					Ordenar por
					<SelectBox
						value={sortKey}
						onChange={(e) => {
							setSortKey(e.target.value as SortKey);
							setSortDir("asc");
						}}
						className="min-h-11 rounded-full border border-border bg-surface px-4 text-base font-medium text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
					>
						{columns.map((col) => (
							<option key={col.key} value={col.key}>
								{col.label}
							</option>
						))}
					</SelectBox>
				</label>
				<IconButton
					label={sortDir === "asc" ? "Orden ascendente (cambiar)" : "Orden descendente (cambiar)"}
					icon={sortDir === "asc" ? ArrowUp : ArrowDown}
					onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
				/>
				<ExportButton
					kind="publishers"
					formats={["xlsx"]}
					label="Descargar lista de publicadores"
					title="Descargar publicadores"
				/>
			</div>

			<List>
				{loading && sortedRows.length === 0 && <PageLoader />}
				{!loading && sortedRows.length === 0 && (
					<div className="px-4 py-6 text-center text-sm text-ink-soft">No hay personas que coincidan.</div>
				)}
				{sortedRows.map((row) => {
					const rowIsAdmin = row.systemRole === "admin";
					const group = groupFor(row.fieldServiceGroupId);
					const subtitleParts: string[] = [];
					if (row.congregationStatus !== "active") {
						subtitleParts.push(CONGREGATION_STATUS_LABELS[row.congregationStatus] ?? row.congregationStatus);
					}
					if (row.accountStatus === "no_account") subtitleParts.push("Sin acceso a la app");
					else if (row.accountStatus !== "active") {
						subtitleParts.push(ACCOUNT_STATUS_LABEL[row.accountStatus]?.label ?? row.accountStatus);
					}
					if (canViewProgress && row.serviceYearHours != null) subtitleParts.push(`${row.serviceYearHours}/600 h`);
					const appointmentTypes = activeAppointmentTypes(row);
					return (
						<div key={row.id} className="flex items-center gap-1 pr-2 hover:bg-surface-alt md:pr-3">
							<Link href={`/publishers/${row.id}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2">
								<Avatar name={row.fullName} />
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-semibold text-ink">
										<span>{row.fullName}</span>
										{row.isHiddenAdmin && <Badge tone="neutral">Oculto</Badge>}
									</div>
									<div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-soft">
										{group ? (
											<span className="inline-flex items-center gap-1.5">
												{group.color && (
													<span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
												)}
												{group.name}
											</span>
										) : (
											<span>Sin grupo</span>
										)}
										{subtitleParts.map((part) => (
											<span key={part}>· {part}</span>
										))}
									</div>
								</div>
								{!row.isHiddenAdmin && appointmentTypes.length > 0 && (
									<div className="shrink-0">
										<AppointmentBadges activeAppointmentTypes={appointmentTypes} />
									</div>
								)}
							</Link>
							{/* En móvil estas acciones viven en la ficha; en escritorio se ofrecen en la fila. */}
							<div className="hidden shrink-0 items-center md:flex">
								{(s21Scope.all || (row.fieldServiceGroupId !== null && s21Scope.groupIds.includes(row.fieldServiceGroupId))) && (
									<S21Button userId={row.id} variant="row" />
								)}
								<EditPublisherForm publisher={row} groups={groups} canEditGroup={canEditGroup} onSaved={() => load(showHidden)} canManageAccess={isAdmin} />
								{canManageAppointments && (
									<AppointmentsCard
										publisherId={row.id}
										appointments={row.appointments}
										compact
										onSaved={() => load(showHidden)}
									/>
								)}
								{canViewPrivileges && (
									<PrivilegesCard
										publisherId={row.id}
										grantedPrivileges={row.privileges}
										readOnly={!canAdministerAccounts}
										compact
										onSaved={() => load(showHidden)}
									/>
								)}
								{canDelete && (
									<DeletePublisherButton
										publisherId={row.id}
										fullName={row.fullName}
										isAdmin={rowIsAdmin}
										onDeleted={() => load(showHidden)}
									/>
								)}
							</div>
						</div>
					);
				})}
			</List>

			<Fab label="Nuevo" icon={Plus} onClick={() => setModalOpen(true)} />

			<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo publicador">
				<PublisherForm
					onCreated={() => {
						setModalOpen(false);
						load(showHidden);
					}}
				/>
			</Modal>
		</div>
	);
}
