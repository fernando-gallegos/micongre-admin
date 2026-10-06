"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Tooltip } from "./Tooltip";

/** Título de página (Fraunces) con subtítulo y acciones a la derecha. */
export function PageHeader({
	title,
	subtitle,
	actions,
}: {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	actions?: React.ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="min-w-0">
				<h1 className="font-display text-[28px] font-medium leading-tight tracking-tight text-ink sm:text-3xl">{title}</h1>
				{subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
			</div>
			{actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
		</div>
	);
}

/** Rótulo pequeño en mayúsculas sobre una lista. */
export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
	return (
		<div className="mb-2 flex items-baseline justify-between px-1">
			<h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-soft">{children}</h2>
			{right && <span className="text-[13px] text-ink-soft">{right}</span>}
		</div>
	);
}

/** Pestañas en píldora (reemplaza las pestañas con subrayado). */
export function Segmented<T extends string>({
	value,
	onChange,
	options,
	label,
}: {
	value: T;
	onChange: (value: T) => void;
	options: { value: T; label: string }[];
	label?: string;
}) {
	return (
		<div role="tablist" aria-label={label} className="flex rounded-full bg-surface-alt p-1">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					role="tab"
					aria-selected={value === o.value}
					onClick={() => onChange(o.value)}
					className={`min-h-10 flex-1 rounded-full px-3 text-sm transition-colors ${
						value === o.value ? "bg-surface font-semibold text-ink shadow-sm" : "font-medium text-ink-soft hover:text-ink"
					}`}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

/** Filtros: píldoras que se acomodan en varias líneas. */
export function ChipGroup({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={!!active}
			className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] transition-colors ${
				active
					? "border-accent bg-accent font-semibold text-accent-ink"
					: "border-border bg-transparent font-medium text-ink hover:bg-surface-alt"
			}`}
		>
			{children}
		</button>
	);
}

/** Lista: una sola superficie con filas separadas por líneas finas. */
export function List({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return <div className={`divide-y divide-border overflow-hidden rounded-[20px] bg-surface ${className}`}>{children}</div>;
}

/** Fila de lista: elemento inicial, título/subtítulo y acciones al final. Con `href` toda la fila es un enlace. */
export function ListRow({
	leading,
	title,
	subtitle,
	trailing,
	href,
	onClick,
}: {
	leading?: React.ReactNode;
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	trailing?: React.ReactNode;
	href?: string;
	onClick?: () => void;
}) {
	const body = (
		<>
			{leading}
			<div className="min-w-0 flex-1">
				<div className="text-base font-semibold text-ink">{title}</div>
				{subtitle && <div className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</div>}
			</div>
			{trailing}
		</>
	);
	const cls = "flex min-h-14 items-center gap-3 px-4 py-3";
	if (href) return <Link href={href} className={`${cls} hover:bg-surface-alt`}>{body}</Link>;
	if (onClick) return <button type="button" onClick={onClick} className={`${cls} w-full text-left hover:bg-surface-alt`}>{body}</button>;
	return <div className={cls}>{body}</div>;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
	const parts = name.trim().split(/\s+/);
	const initials = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
	return (
		<div
			style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
			className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent"
		>
			{initials}
		</div>
	);
}

/** Botón de solo ícono (44 px) con globito de ayuda. `tone="accent"` lo resalta; con `href` es un enlace. */
export function IconButton({
	label,
	icon: Icon,
	onClick,
	href,
	tone = "plain",
	disabled,
}: {
	label: string;
	icon: LucideIcon;
	onClick?: () => void;
	href?: string;
	tone?: "plain" | "accent" | "danger";
	disabled?: boolean;
}) {
	const cls = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
		tone === "accent"
			? "bg-accent-soft text-accent hover:opacity-80"
			: tone === "danger"
				? "text-red-600 hover:bg-red-50"
				: "text-ink hover:bg-surface-alt"
	}`;
	return (
		<Tooltip content={label}>
			{href ? (
				<Link href={href} aria-label={label} className={cls}>
					<Icon size={20} />
				</Link>
			) : (
				<button type="button" aria-label={label} onClick={onClick} disabled={disabled} className={cls}>
					<Icon size={20} />
				</button>
			)}
		</Tooltip>
	);
}

/** Botón flotante de la acción principal de una pantalla (queda sobre la barra inferior en móvil). */
export function Fab({
	label,
	icon: Icon,
	onClick,
	href,
}: {
	label: string;
	icon: LucideIcon;
	onClick?: () => void;
	href?: string;
}) {
	const cls =
		"fixed bottom-[calc(72px+env(safe-area-inset-bottom)+20px)] right-5 z-30 inline-flex h-[52px] items-center gap-2 rounded-full bg-accent pl-4 pr-5 text-[15px] font-semibold text-accent-ink shadow-lg shadow-black/20 transition-colors hover:bg-accent-strong md:bottom-8 md:right-8 print:hidden";
	return href ? (
		<Link href={href} className={cls}>
			<Icon size={20} />
			{label}
		</Link>
	) : (
		<button type="button" onClick={onClick} className={cls}>
			<Icon size={20} />
			{label}
		</button>
	);
}
