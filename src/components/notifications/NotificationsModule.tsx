"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Fab, List, PageHeader, Segmented } from "@/components/ui/Layout";
import { NotificationMarkdown } from "@/components/notifications/NotificationMarkdown";
import { NotificationFeed, useReceivedNotifications } from "@/components/notifications/ReceivedNotifications";
import { GroupBadge } from "@/components/serviceGroups/GroupBadge";
import { formatShortDate, formatShortDateTime } from "@/lib/dateFormat";
import { PageLoader } from "@/components/ui/Spinner";

type Scope = "publisher" | "group" | "congregation";
type Tab = "received" | "sent";

const SCOPE_LABELS: Record<Scope, string> = {
	publisher: "A publicadores puntuales",
	group: "A mi grupo de servicio",
	congregation: "A toda la congregación",
};

interface PublisherOption {
	id: string;
	fullName: string;
	phone: string | null;
}

interface SentNotification {
	id: string;
	scope: Scope;
	groupName: string | null;
	groupColor: string | null;
	message: string;
	expiresAt: string;
	createdAt: string;
	recipientNames: string[];
	senderName: string;
}

function defaultExpiresAt(): string {
	return new Date().toISOString().slice(0, 10);
}

function isExpired(expiresAt: string): boolean {
	return expiresAt < new Date().toISOString().slice(0, 10);
}

// Avisos: todos ven lo que les llegó (Recibidos); quien tiene algún privilegio
// de envío ve además Enviados y el botón «Nuevo aviso».
export function NotificationsModule({ availableScopes, canSend }: { availableScopes: Scope[]; canSend: boolean }) {
	const [tab, setTab] = useState<Tab>("received");
	const [composeOpen, setComposeOpen] = useState(false);

	const [scope, setScope] = useState<Scope>(availableScopes[0] ?? "publisher");
	const [message, setMessage] = useState("");
	const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
	const [search, setSearch] = useState("");
	const [results, setResults] = useState<PublisherOption[]>([]);
	const [selected, setSelected] = useState<PublisherOption[]>([]);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sent, setSent] = useState<SentNotification[]>([]);
	const [loadingSent, setLoadingSent] = useState(canSend);

	const received = useReceivedNotifications();

	const loadSent = useCallback(async () => {
		setLoadingSent(true);
		const response = await fetch("/api/notifications");
		if (response.ok) setSent(((await response.json()) as { items: SentNotification[] }).items);
		setLoadingSent(false);
	}, []);

	useEffect(() => {
		if (canSend) loadSent();
	}, [canSend, loadSent]);

	async function searchPublishers(term: string) {
		setSearch(term);
		if (!term.trim()) {
			setResults([]);
			return;
		}
		const response = await fetch(`/api/publishers?search=${encodeURIComponent(term)}`);
		if (response.ok) setResults(((await response.json()) as { items: PublisherOption[] }).items);
	}

	function addRecipient(publisher: PublisherOption) {
		if (!selected.some((p) => p.id === publisher.id)) setSelected((prev) => [...prev, publisher]);
		setSearch("");
		setResults([]);
	}

	function removeRecipient(id: string) {
		setSelected((prev) => prev.filter((p) => p.id !== id));
	}

	async function send() {
		setSending(true);
		setError(null);
		const body =
			scope === "publisher"
				? { scope, message, expiresAt, recipientUserIds: selected.map((p) => p.id) }
				: { scope, message, expiresAt };
		const response = await fetch("/api/notifications", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		setSending(false);
		if (!response.ok) {
			const errBody = (await response.json().catch(() => ({}))) as { error?: string };
			setError(
				errBody.error === "no_group"
					? "No perteneces a ningún grupo de servicio."
					: "No se pudo enviar la notificación.",
			);
			return;
		}
		setMessage("");
		setSelected([]);
		setExpiresAt(defaultExpiresAt());
		setComposeOpen(false);
		setTab("sent");
		loadSent();
	}

	const canSubmit =
		message.trim().length > 0 && expiresAt.trim().length > 0 && (scope !== "publisher" || selected.length > 0);

	return (
		<div className={`flex flex-col gap-5 ${canSend ? "pb-20" : ""}`}>
			<PageHeader title="Avisos" />

			{canSend && (
				<Segmented
					label="Avisos"
					value={tab}
					onChange={setTab}
					options={[
						{ value: "received", label: "Recibidos" },
						{ value: "sent", label: "Enviados" },
					]}
				/>
			)}

			{tab === "received" &&
				(received.loading ? (
					<PageLoader />
				) : received.items.length === 0 ? (
					<List>
						<p className="px-4 py-5 text-sm text-ink-soft">No tienes avisos nuevos.</p>
					</List>
				) : (
					<NotificationFeed items={received.items} onDismiss={received.dismiss} />
				))}

			{canSend && tab === "sent" &&
				(loadingSent ? (
					<PageLoader />
				) : sent.length === 0 ? (
					<List>
						<p className="px-4 py-5 text-sm text-ink-soft">Todavía no has enviado ningún aviso.</p>
					</List>
				) : (
					<List>
						{sent.map((n) => (
							<div key={n.id} className="flex flex-col gap-1.5 px-4 py-3.5">
								<NotificationMarkdown message={n.message} />
								<p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-soft">
									<span>
										{n.scope === "congregation"
											? "Toda la congregación"
											: n.scope === "group"
												? "Grupo"
												: `Para: ${n.recipientNames.join(", ")}`}
									</span>
									{n.scope === "group" && <GroupBadge name={n.groupName ?? "—"} color={n.groupColor} />}
									<span>· {formatShortDateTime(n.createdAt)}</span>
								</p>
								<p className="flex items-center gap-2 text-[13px] text-ink-soft">
									<span>Válida hasta {formatShortDate(n.expiresAt)}</span>
									{isExpired(n.expiresAt) && <Badge tone="neutral">Vencida</Badge>}
								</p>
							</div>
						))}
					</List>
				))}

			{canSend && <Fab label="Nuevo aviso" icon={Plus} onClick={() => setComposeOpen(true)} />}

			{canSend && (
				<Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="Nuevo aviso">
					<div className="flex flex-col gap-4">
						{availableScopes.length > 1 && (
							<Select label="Enviar a" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
								{availableScopes.map((s) => (
									<option key={s} value={s}>
										{SCOPE_LABELS[s]}
									</option>
								))}
							</Select>
						)}

						{scope === "publisher" && (
							<div className="flex flex-col gap-2">
								<Input
									label="Buscar publicador"
									value={search}
									onChange={(e) => searchPublishers(e.target.value)}
									placeholder="Nombre..."
								/>
								{results.length > 0 && (
									<div className="flex max-h-40 flex-col divide-y divide-border overflow-y-auto rounded-2xl bg-surface-alt">
										{results.map((p) => (
											<button
												key={p.id}
												type="button"
												onClick={() => addRecipient(p)}
												className="min-h-11 px-4 py-2 text-left text-sm text-ink hover:bg-bg"
											>
												{p.fullName}
											</button>
										))}
									</div>
								)}
								{selected.length > 0 && (
									<div className="flex flex-wrap gap-2">
										{selected.map((p) => (
											<span
												key={p.id}
												className="flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1.5 text-[13px] font-medium text-accent"
											>
												{p.fullName}
												<button
													type="button"
													onClick={() => removeRecipient(p.id)}
													aria-label={`Quitar a ${p.fullName}`}
													className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/5"
												>
													<X size={14} />
												</button>
											</span>
										))}
									</div>
								)}
							</div>
						)}

						<label className="flex flex-col gap-1 text-sm">
							<span className="font-medium text-ink">Mensaje</span>
							<textarea
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								rows={4}
								className="rounded-2xl border border-border bg-surface px-4 py-3 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
							/>
							<span className="text-xs text-ink-soft">
								Admite Markdown: **negrita**, *cursiva*, # título, listas con - o 1.
							</span>
						</label>

						<div className="flex flex-col gap-1">
							<Input
								label="Válida hasta"
								type="date"
								value={expiresAt}
								onChange={(e) => setExpiresAt(e.target.value)}
								required
								className="max-w-[12rem]"
							/>
							<p className="text-xs text-ink-soft">
								Por defecto, solo hoy. Después de esa fecha deja de mostrarse en Mi Panel; sigue visible en Enviados.
							</p>
						</div>

						{error && <p className="text-sm text-red-600">{error}</p>}
						<Button onClick={send} disabled={!canSubmit || sending} className="w-full">
							<Send size={16} />
							{sending ? "Enviando..." : "Enviar"}
						</Button>
					</div>
				</Modal>
			)}
		</div>
	);
}
