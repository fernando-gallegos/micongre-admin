"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
	Archive,
	FileSpreadsheet,
	Check,
	CheckCircle2,
	Database,
	Eye,
	EyeOff,
	FileJson,
	Loader2,
	Rocket,
	Sparkles,
	TriangleAlert,
	Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { parseHourglassExport, type HourglassImportStats } from "@/lib/setup/hourglass";
import type { NwsStats } from "@/lib/setup/nws";
import { JwCongregationLookup, type JwCongregationData } from "./JwCongregationLookup";
import { NwsImportModal } from "./NwsImportModal";

type Source = "hourglass" | "nws" | "backup" | "scratch";

const STEPS = ["Bienvenida", "Origen de datos", "Congregación", "Administrador"] as const;
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const FADE_OUT_MS = 800;

interface CongregationForm {
	name: string;
	congregationNumber: string;
	circuitId: string;
	language: string;
	kingdomHallAddress: string;
	isContactCongregation: boolean;
	midweekDay: string;
	midweekTime: string;
	weekendDay: string;
	weekendTime: string;
	preachingTime: string;
}

interface CongregationResponse {
	name: string;
	congregationNumber: string;
	circuitId: string;
	language: string;
	kingdomHallAddress: string;
	isContactCongregation: boolean;
	midweek: { day: string; time: string } | null;
	weekend: { day: string; time: string } | null;
	preachingTime?: string;
}

const ERRORS: Record<string, string> = {
	already_configured: "La aplicación ya fue configurada. Recarga la página.",
	database_not_empty: "Ya hay personas cargadas en la base de datos; no se puede migrar encima.",
	username_taken: "Ese usuario ya está en uso. Elige otro.",
	invalid_hourglass: "El archivo no es un export válido de Hourglass.",
	import_failed: "No se pudo completar la migración y no se guardó nada. Intenta de nuevo.",
	invalid_body: "Revisa los datos e intenta de nuevo.",
	invalid_backup: "El archivo no es un respaldo válido de Mi Congre.",
	invalid_nws: "Los archivos de NWScheduler no son válidos.",
	restore_failed: "No se pudo restaurar el respaldo y no se cambió nada. Intenta de nuevo.",
};

interface RestoreResponse {
	tables: number;
	rows: number;
	byTable: Record<string, number>;
	skipped: string[];
	adminExists: boolean;
}

interface DoneSummary {
	title: string;
	stats: { label: string; value: number }[];
	notes: string[];
	// El respaldo trajo un administrador: no queda nada por configurar.
	finishesWizard: boolean;
}

type MigrationState =
	| { status: "idle" }
	| { status: "processing"; fileName: string; kind: Source }
	| { status: "done"; fileName: string; summary: DoneSummary }
	| { status: "error"; message: string };

function hourglassSummary(stats: HourglassImportStats): DoneSummary {
	return {
		title: "Migración completada",
		stats: [
			{ label: "Publicadores", value: stats.publishers },
			{ label: "Inactivos", value: stats.inactive },
			{ label: "Grupos de servicio", value: stats.groups },
			{ label: "Nombramientos", value: stats.appointments },
			{ label: "Privilegios", value: stats.privileges },
			{ label: "Informes de servicio", value: stats.reports },
		],
		notes: [
			...(stats.reportsSkipped > 0
				? [`${stats.reportsSkipped} informes se omitieron por no corresponder a ninguna persona del archivo.`]
				: []),
			"Las cuentas no se migran: cada persona recibe acceso luego con su enlace de activación. Ahora revisa los datos de la congregación.",
		],
		finishesWizard: false,
	};
}

function nwsSummary(stats: NwsStats, warnings: string[]): DoneSummary {
	return {
		title: "Migración completada",
		stats: [
			{ label: "Personas", value: stats.people },
			{ label: "Inactivas", value: stats.inactive },
			{ label: "Hogares", value: stats.households },
			{ label: "Grupos de servicio", value: stats.groups },
			{ label: "Nombramientos", value: stats.appointments },
			{ label: "Privilegios", value: stats.privileges },
			{ label: "Contactos de emergencia", value: stats.emergencyContacts },
			{ label: "Informes de servicio", value: stats.reports },
			{ label: "Oradores", value: stats.speakers },
			{ label: "Reuniones de fin de semana", value: stats.meetings },
		],
		notes: [
			...warnings,
			"Las cuentas no se migran: cada persona recibe acceso luego con su enlace de activación. NWScheduler no trae los datos de la congregación (dirección, horarios…): complétalos en el paso siguiente.",
		],
		finishesWizard: false,
	};
}

function backupSummary(r: RestoreResponse): DoneSummary {
	const n = (t: string) => r.byTable[t] ?? 0;
	return {
		title: "Respaldo restaurado",
		stats: [
			{ label: "Personas", value: n("users") },
			{ label: "Grupos de servicio", value: n("field_service_groups") },
			{ label: "Reuniones entre semana", value: n("midweek_meetings") },
			{ label: "Reuniones fin de semana", value: n("weekend_meetings") },
			{ label: "Informes de servicio", value: n("service_reports") },
			{ label: "Registros en total", value: r.rows },
		],
		notes: [
			...(r.skipped.length > 0
				? [`No se restauró (ya no existe en esta versión): ${r.skipped.slice(0, 6).join(", ")}${r.skipped.length > 6 ? "…" : ""}.`]
				: []),
			r.adminExists
				? "El respaldo incluye las cuentas de acceso: inicia sesión con tu usuario y contraseña de siempre."
				: "El respaldo no trae ningún administrador. Ahora revisa los datos de la congregación y crea la cuenta de administrador.",
		],
		finishesWizard: r.adminExists,
	};
}

export function SetupWizard({ existingUserCount }: { existingUserCount: number }) {
	const router = useRouter();
	const [step, setStep] = useState(0);
	const [source, setSource] = useState<Source | null>(null);
	const [migration, setMigration] = useState<MigrationState>({ status: "idle" });
	const [nwsOpen, setNwsOpen] = useState(false);
	// Mensaje de lo cargado en esta sesión (migración o respaldo); null si nada.
	const [loadedMessage, setLoadedMessage] = useState<string | null>(null);
	const [congregation, setCongregation] = useState<CongregationForm | null>(null);
	const [congregationError, setCongregationError] = useState<string | null>(null);
	const [savingCongregation, setSavingCongregation] = useState(false);
	const [admin, setAdmin] = useState({ fullName: "", username: "", password: "" });
	const [showPassword, setShowPassword] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [leaving, setLeaving] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const pickingKind = useRef<Source>("hourglass");

	// Ya había gente cargada antes de abrir el asistente (p. ej. con el script
	// de importación, o una migración hecha en una visita anterior al asistente).
	const hasData = existingUserCount > 0 || loadedMessage !== null;

	// Al llegar al paso de la congregación se trae lo que ya haya en la base
	// (típicamente, lo que dejó la migración) para precargarlo.
	useEffect(() => {
		if (step !== 2 || congregation) return;
		let cancelled = false;
		fetch("/api/setup/congregation")
			.then(async (res) => {
				if (!res.ok) throw new Error();
				const c = (await res.json()) as CongregationResponse;
				if (cancelled) return;
				setCongregation({
					name: c.name,
					congregationNumber: c.congregationNumber,
					circuitId: c.circuitId,
					language: c.language || "Español",
					kingdomHallAddress: c.kingdomHallAddress,
					isContactCongregation: c.isContactCongregation,
					midweekDay: c.midweek?.day ?? "",
					midweekTime: c.midweek?.time ?? "",
					weekendDay: c.weekend?.day ?? "",
					weekendTime: c.weekend?.time ?? "",
					preachingTime: c.preachingTime ?? "",
				});
			})
			.catch(() => {
				if (!cancelled) setCongregationError("No se pudieron cargar los datos de la congregación.");
			});
		return () => {
			cancelled = true;
		};
	}, [step, congregation]);

	// Datos traídos de JW.ORG: pisan los campos que JW.ORG sí tiene (nombre,
	// dirección y horarios); número, circuito e idioma no vienen de allá.
	function applyJwData(d: JwCongregationData) {
		setCongregation((c) =>
			c
				? {
						...c,
						name: d.name || c.name,
						kingdomHallAddress: d.address || c.kingdomHallAddress,
						midweekDay: d.midweekDay || c.midweekDay,
						midweekTime: d.midweekTime || c.midweekTime,
						weekendDay: d.weekendDay || c.weekendDay,
						weekendTime: d.weekendTime || c.weekendTime,
					}
				: c,
		);
	}

	function setCong<K extends keyof CongregationForm>(key: K, value: CongregationForm[K]) {
		setCongregation((c) => (c ? { ...c, [key]: value } : c));
	}

	async function runNws(texts: string[]) {
		setNwsOpen(false);
		setMigration({ status: "processing", fileName: `${texts.length} archivo(s) de NWScheduler`, kind: "nws" });
		try {
			const response = await fetch("/api/setup/nws", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ files: texts }),
			});
			const body = (await response.json().catch(() => ({}))) as {
				error?: string;
				message?: string;
				stats?: NwsStats;
				warnings?: string[];
			};
			if (!response.ok || !body.stats) {
				setMigration({
					status: "error",
					message: body.message ?? ERRORS[body.error ?? ""] ?? "No se pudo completar. Intenta de nuevo.",
				});
				return;
			}
			setLoadedMessage(`Migración lista: ${body.stats.people} personas cargadas.`);
			setSource("nws");
			setMigration({
				status: "done",
				fileName: `${texts.length} archivo(s) de NWScheduler`,
				summary: nwsSummary(body.stats, body.warnings ?? []),
			});
		} catch {
			setMigration({ status: "error", message: "No se pudo conectar. Intenta de nuevo." });
		}
	}

	function pickFile(kind: Source) {
		pickingKind.current = kind;
		fileInput.current?.click();
	}

	async function handleFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		const kind = pickingKind.current;
		setMigration({ status: "processing", fileName: file.name, kind });
		try {
			const parsed: unknown = JSON.parse(await file.text());
			let payload: unknown = parsed;
			if (kind === "hourglass") {
				payload = parseHourglassExport(parsed);
				if (!payload) {
					setMigration({ status: "error", message: ERRORS.invalid_hourglass });
					return;
				}
			}
			const response = await fetch(kind === "hourglass" ? "/api/setup/hourglass" : "/api/setup/restore", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const body = (await response.json().catch(() => ({}))) as { error?: string; stats?: HourglassImportStats } & Partial<RestoreResponse>;
			const ok = response.ok && (kind === "hourglass" ? !!body.stats : body.rows !== undefined);
			if (!ok) {
				setMigration({ status: "error", message: ERRORS[body.error ?? ""] ?? "No se pudo completar. Intenta de nuevo." });
				return;
			}
			const summary = kind === "hourglass" ? hourglassSummary(body.stats!) : backupSummary(body as RestoreResponse);
			setLoadedMessage(
				kind === "hourglass"
					? `Migración lista: ${body.stats!.publishers + body.stats!.inactive} personas cargadas.`
					: "Respaldo restaurado.",
			);
			setSource(kind);
			setMigration({ status: "done", fileName: file.name, summary });
		} catch {
			setMigration({
				status: "error",
				message: "No se pudo leer el archivo. Debe ser un archivo JSON (export de Hourglass o respaldo de Mi Congre).",
			});
		}
	}

	function closeMigrationModal() {
		const done = migration.status === "done" ? migration.summary : null;
		setMigration({ status: "idle" });
		if (!done) return;
		if (done.finishesWizard) {
			// El respaldo ya traía administrador: se desvanece y se va al login.
			setLeaving(true);
			setTimeout(() => router.replace("/login"), FADE_OUT_MS);
			return;
		}
		// Tras una migración exitosa, se sigue con la congregación (precargada).
		setStep(2);
	}

	async function saveCongregationAndContinue() {
		if (!congregation) return;
		setSavingCongregation(true);
		setCongregationError(null);
		try {
			const response = await fetch("/api/setup/congregation", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: congregation.name.trim(),
					congregationNumber: congregation.congregationNumber.trim() || null,
					circuitId: congregation.circuitId.trim() || null,
					language: congregation.language.trim() || null,
					kingdomHallAddress: congregation.kingdomHallAddress.trim() || null,
					isContactCongregation: congregation.isContactCongregation,
					preachingTime: congregation.preachingTime || null,
					meetingSchedules: {
						midweek:
							congregation.midweekDay && congregation.midweekTime
								? { day: congregation.midweekDay, time: congregation.midweekTime }
								: null,
						weekend:
							congregation.weekendDay && congregation.weekendTime
								? { day: congregation.weekendDay, time: congregation.weekendTime }
								: null,
					},
				}),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as { error?: string };
				setCongregationError(ERRORS[body.error ?? ""] ?? "No se pudieron guardar los datos. Intenta de nuevo.");
				return;
			}
			setStep(3);
		} catch {
			setCongregationError("No se pudo conectar. Intenta de nuevo.");
		} finally {
			setSavingCongregation(false);
		}
	}

	async function handleFinish() {
		setSubmitting(true);
		setSubmitError(null);
		try {
			const response = await fetch("/api/setup/admin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					fullName: admin.fullName.trim(),
					username: admin.username.trim(),
					password: admin.password,
				}),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as { error?: string };
				setSubmitError(ERRORS[body.error ?? ""] ?? "No se pudo crear la cuenta. Intenta de nuevo.");
				setSubmitting(false);
				return;
			}
			// La sesión ya quedó iniciada (cookies): se desvanece todo y se entra al
			// panel, que es a donde lleva "/" ahora que hay administrador.
			setLeaving(true);
			setTimeout(() => {
				router.replace("/panel");
				router.refresh();
			}, FADE_OUT_MS);
		} catch {
			setSubmitError("No se pudo conectar. Intenta de nuevo.");
			setSubmitting(false);
		}
	}

	const adminValid =
		admin.fullName.trim().length >= 3 && /^[a-zA-Z0-9._-]{3,50}$/.test(admin.username.trim()) && admin.password.length >= 8;
	const canContinueFromSource = hasData || source === "scratch";

	return (
		<main
			className="flex min-h-screen flex-col items-center bg-bg px-4 py-10 transition-opacity ease-out"
			style={{ opacity: leaving ? 0 : 1, transitionDuration: `${FADE_OUT_MS}ms` }}
		>
			<div className="w-full max-w-2xl">
				<div className="mb-8 flex items-center gap-3">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src="/logo.svg" alt="Mi Congre" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
					<span className="font-display text-xl font-semibold text-ink">Mi Congre</span>
				</div>

				<ol className="mb-6 flex items-center gap-2" aria-label="Progreso">
					{STEPS.map((label, i) => (
						<li key={label} className="flex flex-1 flex-col gap-1.5">
							<div className={`h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-border"}`} />
							<span className={`hidden text-xs sm:block ${i === step ? "font-medium text-ink" : "text-ink-soft"}`}>
								{i + 1}. {label}
							</span>
						</li>
					))}
				</ol>

				<Card className="p-6 sm:p-8">
					{step === 0 && (
						<div className="flex flex-col gap-5">
							<div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
								<Sparkles size={24} />
							</div>
							<div>
								<h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Te damos la bienvenida a Mi Congre</h1>
								<p className="mt-2 text-sm leading-relaxed text-ink-soft">
									Vamos a dejar la aplicación lista en unos pocos pasos: decidir si traes datos de otro sistema, registrar los
									datos de tu congregación y crear la cuenta del administrador principal.
								</p>
							</div>
							<ul className="flex flex-col gap-2 text-sm text-ink">
								{STEPS.slice(1).map((label, i) => (
									<li key={label} className="flex items-center gap-2">
										<span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-alt text-xs text-ink-soft">
											{i + 1}
										</span>
										{label}
									</li>
								))}
							</ul>
							<div className="flex justify-end">
								<Button onClick={() => setStep(1)}>Comenzar</Button>
							</div>
						</div>
					)}

					{step === 1 && (
						<div className="flex flex-col gap-5">
							<div>
								<h2 className="font-display text-xl font-semibold text-ink">¿Cómo quieres empezar?</h2>
								<p className="mt-1 text-sm text-ink-soft">
									Trae tus datos de otro sistema o de un respaldo (elige la opción y sube el archivo) o comienza con todo vacío.
								</p>
							</div>

							{hasData && (
								<p className="flex items-start gap-2 rounded-2xl bg-accent-soft p-4 text-sm text-ink">
									<CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" />
									{loadedMessage ??
										`Ya hay ${existingUserCount} personas cargadas en la base de datos; se conservan tal cual.`}
								</p>
							)}

							<input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={handleFile} />
							<div className="-mx-2 flex flex-col divide-y divide-border">
								<OptionCard
									icon={<Database size={18} />}
									title="Migrar desde Hourglass"
									description="Publicadores, grupos de servicio, nombramientos, privilegios e historial de informes. Al elegirla, cargas el archivo JSON exportado."
									selected={source === "hourglass"}
									disabled={hasData}
									action={<Upload size={16} className="text-ink-soft" />}
									onSelect={() => pickFile("hourglass")}
								/>
								<OptionCard
									icon={<FileSpreadsheet size={18} />}
									title="Migrar desde NWScheduler"
									description="Personas, contactos de emergencia, informes, discursantes y programa de discursos públicos, desde los CSV que exporta NWScheduler."
									selected={source === "nws"}
									disabled={hasData}
									action={<Upload size={16} className="text-ink-soft" />}
									onSelect={() => setNwsOpen(true)}
								/>
								<OptionCard
									icon={<Archive size={18} />}
									title="Restaurar un respaldo de Mi Congre"
									description="Vuelve a cargar todo desde el archivo que se descarga al usar Borrar todos los datos en Congregación."
									selected={source === "backup"}
									disabled={hasData}
									action={<Upload size={16} className="text-ink-soft" />}
									onSelect={() => pickFile("backup")}
								/>
								<OptionCard
									icon={<FileJson size={18} />}
									title="Migrar desde otro sistema"
									description="Próximamente."
									selected={false}
									disabled
									onSelect={() => {}}
								/>
								<OptionCard
									icon={<Rocket size={18} />}
									title="No migrar nada, comenzar desde cero"
									description="Empiezas con la aplicación vacía y vas cargando publicadores y grupos a mano."
									selected={source === "scratch"}
									disabled={hasData}
									onSelect={() => setSource("scratch")}
								/>
							</div>

							<StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={!canContinueFromSource} />
						</div>
					)}

					{step === 2 && (
						<div className="flex flex-col gap-5">
							<div>
								<h2 className="font-display text-xl font-semibold text-ink">Datos de la congregación</h2>
								<p className="mt-1 text-sm text-ink-soft">
									{loadedMessage
										? "Los precargamos con lo que ya hay guardado; revísalos, ajústalos o complétalos."
										: "Solo el nombre es obligatorio. Lo demás puedes completarlo después en Congregación."}
								</p>
							</div>

							{!congregation && !congregationError && (
								<p className="flex items-center gap-2 text-sm text-ink-soft">
									<Loader2 size={16} className="animate-spin" /> Cargando…
								</p>
							)}

							{congregation && (
								<>
									<JwCongregationLookup onFound={applyJwData} />

									<section className="flex flex-col gap-3">
										<h3 className="text-sm font-semibold text-ink">Datos generales</h3>
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
											<Input label="Nombre" value={congregation.name} onChange={(e) => setCong("name", e.target.value)} required />
											<Input
												label="Número de congregación"
												value={congregation.congregationNumber}
												onChange={(e) => setCong("congregationNumber", e.target.value)}
											/>
											<Input label="Circuito" value={congregation.circuitId} onChange={(e) => setCong("circuitId", e.target.value)} />
											<Input label="Idioma" value={congregation.language} onChange={(e) => setCong("language", e.target.value)} />
										</div>
										<Input
											label="Dirección del Salón del Reino"
											value={congregation.kingdomHallAddress}
											onChange={(e) => setCong("kingdomHallAddress", e.target.value)}
										/>
										<label className="flex min-h-11 items-center gap-3 text-sm">
											<input className="h-5 w-5 accent-[var(--accent)]"
												type="checkbox"
												checked={congregation.isContactCongregation}
												onChange={(e) => setCong("isContactCongregation", e.target.checked)}
											/>
											Es la congregación de contacto del Salón (sfg 13:4)
										</label>
									</section>

									<section className="flex flex-col gap-3">
										<h3 className="text-sm font-semibold text-ink">Horarios de reunión (sfg 4:4)</h3>
										<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
											<div className="grid grid-cols-2 gap-2">
												<DaySelect label="Entre semana — día" value={congregation.midweekDay} onChange={(v) => setCong("midweekDay", v)} />
												<Input
													label="Hora"
													type="time"
													value={congregation.midweekTime}
													onChange={(e) => setCong("midweekTime", e.target.value)}
												/>
											</div>
											<div className="grid grid-cols-2 gap-2">
												<DaySelect label="Fin de semana — día" value={congregation.weekendDay} onChange={(v) => setCong("weekendDay", v)} />
												<Input
													label="Hora"
													type="time"
													value={congregation.weekendTime}
													onChange={(e) => setCong("weekendTime", e.target.value)}
												/>
											</div>
										</div>
										<Input
											label="Horario de predicación (hora por defecto de las salidas)"
											type="time"
											value={congregation.preachingTime}
											onChange={(e) => setCong("preachingTime", e.target.value)}
										/>
									</section>
								</>
							)}

							{congregationError && <p className="text-sm text-red-600">{congregationError}</p>}

							<StepNav
								onBack={() => setStep(1)}
								onNext={saveCongregationAndContinue}
								backDisabled={savingCongregation}
								nextLabel={savingCongregation ? "Guardando..." : "Continuar"}
								nextDisabled={!congregation || congregation.name.trim().length === 0 || savingCongregation}
							/>
						</div>
					)}

					{step === 3 && (
						<form
							className="flex flex-col gap-5"
							onSubmit={(e) => {
								e.preventDefault();
								if (adminValid && !submitting) void handleFinish();
							}}
						>
							<div>
								<h2 className="font-display text-xl font-semibold text-ink">Cuenta de administrador</h2>
								<p className="mt-1 text-sm text-ink-soft">
									Será el administrador principal. Todas las demás personas son usuarios regulares y acceden según sus
									nombramientos y privilegios. No aparece como publicador en los listados.
								</p>
							</div>

							<Input
								label="Nombre"
								autoComplete="name"
								value={admin.fullName}
								onChange={(e) => setAdmin((a) => ({ ...a, fullName: e.target.value }))}
								required
							/>
							<Input
								label="Usuario"
								autoComplete="username"
								autoCapitalize="none"
								value={admin.username}
								onChange={(e) => setAdmin((a) => ({ ...a, username: e.target.value }))}
								required
							/>
							<div className="flex flex-col gap-1">
								<label className="flex flex-col gap-1 text-sm">
									<span className="font-medium text-ink">Contraseña</span>
									<span className="relative">
										<input
											type={showPassword ? "text" : "password"}
											autoComplete="new-password"
											value={admin.password}
											onChange={(e) => setAdmin((a) => ({ ...a, password: e.target.value }))}
											className="min-h-12 w-full rounded-2xl border border-border bg-surface py-2 pl-4 pr-12 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
											required
										/>
										<button
											type="button"
											onClick={() => setShowPassword((v) => !v)}
											className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-soft hover:text-ink"
											aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
										>
											{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
										</button>
									</span>
								</label>
								<span className="text-xs text-ink-soft">
									Mínimo 8 caracteres. El usuario solo admite letras, números, puntos, guiones y guiones bajos.
								</span>
							</div>

							{submitError && <p className="text-sm text-red-600">{submitError}</p>}

							<StepNav
								onBack={() => setStep(2)}
								nextLabel={submitting ? "Configurando..." : "Finalizar"}
								nextDisabled={!adminValid || submitting}
								submit
								backDisabled={submitting}
							/>
						</form>
					)}
				</Card>
			</div>

			<NwsImportModal open={nwsOpen} onClose={() => setNwsOpen(false)} onImport={runNws} />
			<MigrationModal state={migration} onClose={closeMigrationModal} />
		</main>
	);
}

function MigrationModal({ state, onClose }: { state: MigrationState; onClose: () => void }) {
	if (state.status === "idle") return null;

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
			<style>{`@keyframes setup-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
			<div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-surface p-6 pb-8 shadow-xl sm:rounded-[28px] sm:p-7">
				{state.status === "processing" && (
					<div className="flex flex-col items-center gap-5 py-4 text-center">
						<div className="relative flex h-16 w-16 items-center justify-center">
							<span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
							<span className="absolute inset-0 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
							<Database size={22} className="animate-pulse text-accent" />
						</div>
						<div>
							<h2 className="font-display text-xl font-medium text-ink">
								{state.kind === "backup" ? "Restaurando el respaldo…" : "Migrando datos…"}
							</h2>
							<p className="mt-1 text-sm text-ink-soft">
								Procesando <span className="font-medium text-ink">{state.fileName}</span>. Puede tardar un momento; no cierres
								esta ventana.
							</p>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
							<div className="h-full w-1/4 rounded-full bg-accent" style={{ animation: "setup-indeterminate 1.3s ease-in-out infinite" }} />
						</div>
					</div>
				)}

				{state.status === "done" && (
					<div className="flex flex-col gap-5">
						<div className="flex items-center gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
								<CheckCircle2 size={22} />
							</span>
							<div>
								<h2 className="font-display text-xl font-medium text-ink">{state.summary.title}</h2>
								<p className="text-sm text-ink-soft">{state.fileName}</p>
							</div>
						</div>
						<dl className="grid grid-cols-2 gap-2 text-sm">
							{state.summary.stats.map((st) => (
								<Stat key={st.label} label={st.label} value={st.value} />
							))}
						</dl>
						{state.summary.notes.map((note) => (
							<p key={note} className="text-xs text-ink-soft">
								{note}
							</p>
						))}
						<div className="flex justify-end">
							<Button onClick={onClose}>{state.summary.finishesWizard ? "Ir a iniciar sesión" : "Continuar"}</Button>
						</div>
					</div>
				)}

				{state.status === "error" && (
					<div className="flex flex-col gap-5">
						<div className="flex items-center gap-3">
							<span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-700">
								<TriangleAlert size={22} />
							</span>
							<h2 className="font-display text-xl font-medium text-ink">No se pudo migrar</h2>
						</div>
						<p className="text-sm text-ink-soft">{state.message}</p>
						<div className="flex justify-end">
							<Button variant="secondary" onClick={onClose}>
								Cerrar
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-2xl bg-surface-alt px-3 py-2">
			<dt className="text-xs text-ink-soft">{label}</dt>
			<dd className="text-lg font-semibold text-ink">{value}</dd>
		</div>
	);
}

function DaySelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
	return (
		<Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
			<option value="">—</option>
			{WEEKDAYS.map((d) => (
				<option key={d} value={d}>
					{d}
				</option>
			))}
		</Select>
	);
}

function StepNav({
	onBack,
	onNext,
	nextLabel = "Continuar",
	nextDisabled,
	backDisabled,
	submit,
}: {
	onBack: () => void;
	onNext?: () => void;
	nextLabel?: string;
	nextDisabled?: boolean;
	backDisabled?: boolean;
	submit?: boolean;
}) {
	return (
		<div className="flex items-center justify-between pt-1">
			<Button type="button" variant="ghost" onClick={onBack} disabled={backDisabled}>
				Atrás
			</Button>
			<Button type={submit ? "submit" : "button"} onClick={submit ? undefined : onNext} disabled={nextDisabled}>
				{nextLabel}
			</Button>
		</div>
	);
}

function OptionCard({
	icon,
	title,
	description,
	selected,
	disabled,
	action,
	onSelect,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	selected: boolean;
	disabled?: boolean;
	action?: React.ReactNode;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onSelect}
			aria-pressed={selected}
			className={`flex w-full items-start gap-3 rounded-2xl px-3 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
				selected ? "bg-accent-soft" : "enabled:hover:bg-surface-alt"
			}`}
		>
			<span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-soft">
				{icon}
			</span>
			<span className="flex-1">
				<span className="block text-sm font-semibold text-ink">{title}</span>
				<span className="block text-sm text-ink-soft">{description}</span>
			</span>
			{selected ? (
				<span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
					<Check size={12} />
				</span>
			) : (
				action && <span className="mt-1 shrink-0">{action}</span>
			)}
		</button>
	);
}
