"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { IconButton, SectionLabel } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";

export interface PublisherData {
	id: string;
	fullName: string;
	gender: "male" | "female";
	congregationStatus: string;
	theocraticStatus: string;
	birthDate: string | null;
	baptismDate: string | null;
	phone: string | null;
	email: string | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
	emergencyContactRelation: string | null;
	isMinor: boolean;
	guardianUserId: string | null;
	householdId: string | null;
	fieldServiceGroupId: string | null;
	hasDpaCard: boolean;
	isEligibleForReducedReport: boolean;
	systemRole: "admin" | "regular";
	isHiddenAdmin: boolean;
	active: boolean;
}

interface PublisherOption {
	id: string;
	fullName: string;
}

interface HouseholdOption {
	id: string;
	label: string;
}

export function EditPublisherForm({
	publisher,
	groups = [],
	canEditGroup = false,
	onSaved,
	canManageAccess = true,
}: {
	publisher: PublisherData;
	// Grupos de servicio disponibles; solo se muestra el combo si canEditGroup
	// (admin o "Todos los publicadores" — el servidor descarta el cambio si no).
	groups?: { id: string; name: string }[];
	canEditGroup?: boolean;
	onSaved?: () => void;
	// Falso para quien solo tiene "Publicadores del grupo"/"Todos los
	// publicadores" (no admin): esos campos los descarta igual el servidor,
	// pero ocultarlos evita la falsa impresión de que el cambio se guardó.
	canManageAccess?: boolean;
}) {
	const router = useRouter();
	const [modalOpen, setModalOpen] = useState(false);
	const [form, setForm] = useState<PublisherData>(publisher);
	const [publishers, setPublishers] = useState<PublisherOption[]>([]);
	const [households, setHouseholds] = useState<HouseholdOption[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!modalOpen) return;
		setForm(publisher);
		setError(null);
		// Sin acceso a alguno de los dos módulos (403), su lista queda vacía en vez de romper el formulario.
		fetch("/api/publishers")
			.then((r) => (r.ok ? r.json() : { items: [] }))
			.then((body: unknown) =>
				setPublishers(((body as { items?: PublisherOption[] }).items ?? []).filter((p) => p.id !== publisher.id)),
			)
			.catch(() => setPublishers([]));
		fetch("/api/households")
			.then((r) => (r.ok ? r.json() : { items: [] }))
			.then((body: unknown) => setHouseholds((body as { items?: HouseholdOption[] }).items ?? []))
			.catch(() => setHouseholds([]));
		// publisher es una prop que cambia por referencia en cada render del
		// padre — solo nos importa resincronizar el formulario al abrir el modal.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [modalOpen]);

	function set<K extends keyof PublisherData>(key: K, value: PublisherData[K]) {
		setForm((f) => ({ ...f, [key]: value }));
	}

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setSaving(true);
		setError(null);

		const response = await fetch(`/api/publishers/${publisher.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				fullName: form.fullName,
				gender: form.gender,
				congregationStatus: form.congregationStatus,
				theocraticStatus: form.theocraticStatus,
				birthDate: form.birthDate || null,
				baptismDate: form.baptismDate || null,
				phone: form.phone || null,
				email: form.email || null,
				emergencyContactName: form.emergencyContactName || null,
				emergencyContactPhone: form.emergencyContactPhone || null,
				emergencyContactRelation: form.emergencyContactRelation || null,
				isMinor: form.isMinor,
				guardianUserId: form.isMinor ? form.guardianUserId || null : null,
				householdId: form.householdId || null,
				...(canEditGroup ? { fieldServiceGroupId: form.fieldServiceGroupId || null } : {}),
				hasDpaCard: form.hasDpaCard,
				isEligibleForReducedReport: form.isEligibleForReducedReport,
				...(canManageAccess
					? { systemRole: form.systemRole, isHiddenAdmin: form.isHiddenAdmin, active: form.active }
					: {}),
			}),
		});

		setSaving(false);
		if (!response.ok) {
			setError("No se pudo guardar. Revisa los datos e intenta de nuevo.");
			return;
		}
		setModalOpen(false);
		// Si el publicador editado es quien tiene la sesión abierta (p.ej. un
		// admin editando su propio registro), su nombre vive también en el
		// access token — refrescamos por si acaso, para que se actualice sin
		// tener que cerrar sesión (ver ProfileModal.tsx, mismo patrón).
		await fetch("/api/auth/refresh", { method: "POST" });
		router.refresh();
		onSaved?.();
	}

	return (
		<>
			<IconButton label="Editar publicador" icon={Pencil} onClick={() => setModalOpen(true)} />

			<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Editar datos del publicador">
				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<Input label="Nombre completo" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required />

					<div className="grid grid-cols-2 gap-3">
						<Select label="Sexo" value={form.gender} onChange={(e) => set("gender", e.target.value as PublisherData["gender"])}>
							<option value="male">Varón</option>
							<option value="female">Mujer</option>
						</Select>
						<Select
							label="Condición congregacional"
							value={form.congregationStatus}
							onChange={(e) => set("congregationStatus", e.target.value)}
						>
							<option value="active">Activo</option>
							<option value="inactive">Inactivo</option>
							<option value="irregular">Irregular</option>
							<option value="disfellowshipped">Sacado</option>
						</Select>
					</div>

					<Select
						label="Condición teocrática"
						value={form.theocraticStatus}
						onChange={(e) => set("theocraticStatus", e.target.value)}
					>
						<option value="student">Estudiante</option>
						<option value="unbaptized_publisher">Publicador no bautizado</option>
						<option value="baptized_publisher">Publicador bautizado</option>
					</Select>

					<div className="grid grid-cols-2 gap-3">
						<Input
							label="Nacimiento"
							type="date"
							value={form.birthDate ?? ""}
							onChange={(e) => set("birthDate", e.target.value)}
						/>
						<Input
							label="Bautismo"
							type="date"
							value={form.baptismDate ?? ""}
							onChange={(e) => set("baptismDate", e.target.value)}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<Input label="Teléfono" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
						<Input
							label="Correo (solo contacto)"
							type="email"
							value={form.email ?? ""}
							onChange={(e) => set("email", e.target.value)}
						/>
					</div>

					<div className="mt-2"><SectionLabel>Contacto de emergencia</SectionLabel></div>
					<Input
						label="Nombre"
						value={form.emergencyContactName ?? ""}
						onChange={(e) => set("emergencyContactName", e.target.value)}
					/>
					<div className="grid grid-cols-2 gap-3">
						<Input
							label="Teléfono"
							value={form.emergencyContactPhone ?? ""}
							onChange={(e) => set("emergencyContactPhone", e.target.value)}
						/>
						<Input
							label="Relación"
							value={form.emergencyContactRelation ?? ""}
							onChange={(e) => set("emergencyContactRelation", e.target.value)}
						/>
					</div>

					<Select
						label="Hogar (familia — para la regla de ayudante S-38)"
						value={form.householdId ?? ""}
						onChange={(e) => set("householdId", e.target.value || null)}
					>
						<option value="">Sin hogar asignado</option>
						{households.map((h) => (
							<option key={h.id} value={h.id}>
								{h.label}
							</option>
						))}
					</Select>

					{canEditGroup && (
						<Select
							label="Grupo de servicio"
							value={form.fieldServiceGroupId ?? ""}
							onChange={(e) => set("fieldServiceGroupId", e.target.value || null)}
						>
							<option value="">Sin grupo asignado</option>
							{groups.map((g) => (
								<option key={g.id} value={g.id}>
									{g.name}
								</option>
							))}
						</Select>
					)}

					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input type="checkbox" className="h-5 w-5 shrink-0 accent-accent" checked={form.hasDpaCard} onChange={(e) => set("hasDpaCard", e.target.checked)} />
						Tiene tarjeta DPA (Instrucciones Médicas, sfg 10:2)
					</label>

					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input
							type="checkbox"
							className="h-5 w-5 shrink-0 accent-accent"
							checked={form.isEligibleForReducedReport}
							onChange={(e) => set("isEligibleForReducedReport", e.target.checked)}
						/>
						Elegible para informe de 15 minutos por edad/salud (sfg 10:2)
					</label>

					<label className="flex min-h-11 items-center gap-3 text-sm text-ink">
						<input type="checkbox" className="h-5 w-5 shrink-0 accent-accent" checked={form.isMinor} onChange={(e) => set("isMinor", e.target.checked)} />
						Es menor de edad
					</label>
					{form.isMinor && (
						<Select
							label="Tutor (permiso parental — sfg 1:23-24)"
							value={form.guardianUserId ?? ""}
							onChange={(e) => set("guardianUserId", e.target.value || null)}
						>
							<option value="">Sin asignar</option>
							{publishers.map((p) => (
								<option key={p.id} value={p.id}>
									{p.fullName}
								</option>
							))}
						</Select>
					)}

					{canManageAccess && (
						<>
							<div className="mt-2"><SectionLabel>Acceso al sistema</SectionLabel></div>
							<div className="grid grid-cols-2 gap-3">
								<Select
									label="Rol"
									value={form.systemRole}
									onChange={(e) => {
										const next = e.target.value as PublisherData["systemRole"];
										setForm((f) => ({ ...f, systemRole: next, isHiddenAdmin: next === "admin" ? f.isHiddenAdmin : false }));
									}}
								>
									<option value="regular">Regular</option>
									<option value="admin">Administrador</option>
								</Select>
								<label className="flex min-h-12 items-center gap-3 self-end text-sm text-ink">
									<input type="checkbox" className="h-5 w-5 shrink-0 accent-accent" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
									Cuenta habilitada
								</label>
							</div>

							{form.systemRole === "admin" && (
								<label className="flex items-start gap-3 text-sm text-ink">
									<input
										type="checkbox"
										className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
										checked={form.isHiddenAdmin}
										onChange={(e) => set("isHiddenAdmin", e.target.checked)}
									/>
									<span>
										Administrador oculto
										<span className="block text-xs text-ink-soft">
											No cuenta como Publicador: queda fuera de listados, grupos y estadísticas de la congregación.
										</span>
									</span>
								</label>
							)}
						</>
					)}

					{error && <p className="text-sm text-red-600">{error}</p>}
					<Button type="submit" disabled={saving} className="mt-2">
						{saving ? "Guardando..." : "Guardar cambios"}
					</Button>
				</form>
			</Modal>
		</>
	);
}
