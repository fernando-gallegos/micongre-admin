"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ComboOption {
	value: string;
	label: string;
	disabled?: boolean;
	/** Encabezado del grupo (<optgroup>) al que pertenece. */
	group?: string;
}

// Para buscar sin importar mayúsculas ni acentos ("hector" encuentra "Héctor").
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface PanelPosition {
	sheet: boolean;
	top: number;
	left: number;
	width: number;
}

/** Desplegable con buscador: reemplaza al <select> nativo en toda la app. Se toca el campo, se escribe parte del texto (sin importar
 * mayúsculas ni acentos) y se elige de la lista; con el teclado: flechas, Enter y Escape. La lista se dibuja en un portal para que
 * no la recorten las tablas con scroll; en pantallas angostas sube como una hoja desde abajo. Las listas cortas (7 opciones o menos)
 * no muestran el buscador. La opción de valor "" (p. ej. "Sin asignar" o "Todos") siempre queda visible. */
export function Combobox({
	options,
	value,
	onChange,
	triggerText,
	triggerClassName = "",
	disabled,
	searchable,
	ariaLabel,
	id,
	name,
	required,
}: {
	options: ComboOption[];
	value: string;
	onChange: (value: string) => void;
	/** Texto del campo cerrado; por defecto, la etiqueta de la opción elegida. */
	triggerText?: string;
	/** Clases del campo (borde, alto, color…); el contenido y el ícono los pone el componente. */
	triggerClassName?: string;
	disabled?: boolean;
	/** Fuerza mostrar u ocultar el buscador; por defecto, solo si hay más de 7 opciones. */
	searchable?: boolean;
	ariaLabel?: string;
	id?: string;
	name?: string;
	required?: boolean;
}) {
	const selectedOption = options.find((o) => o.value === value);
	const showSearch = searchable ?? options.filter((o) => o.value !== "").length > 7;

	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const [pos, setPos] = useState<PanelPosition | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	const visible = useMemo(() => {
		const tokens = normalize(query).split(/\s+/).filter(Boolean);
		if (tokens.length === 0) return options;
		return options.filter((o) => o.value === "" || tokens.every((t) => normalize(o.label).includes(t)));
	}, [options, query]);

	const place = useCallback(() => {
		const button = buttonRef.current;
		if (!button) return;
		const rect = button.getBoundingClientRect();
		const sheet = window.innerWidth < 640;
		const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
		const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
		// Hacia abajo si cabe; si no, hacia arriba.
		const spaceBelow = window.innerHeight - rect.bottom;
		const top = spaceBelow >= 300 || spaceBelow >= rect.top ? rect.bottom + 4 : Math.max(8, rect.top - 4 - 340);
		setPos({ sheet, top, left, width });
	}, []);

	function openPanel() {
		if (disabled) return;
		setQuery("");
		setActive(Math.max(0, options.findIndex((o) => o.value === value)));
		place();
		setOpen(true);
	}

	function close(returnFocus = true) {
		setOpen(false);
		if (returnFocus) buttonRef.current?.focus();
	}

	function choose(option: ComboOption | undefined) {
		if (!option || option.disabled) return;
		onChange(option.value);
		close();
	}

	useLayoutEffect(() => {
		if (!open) return;
		if (showSearch) inputRef.current?.focus();
		else panelRef.current?.focus();
	}, [open, showSearch]);

	// Cierra al tocar fuera y reubica al desplazar o redimensionar.
	useEffect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			const target = e.target as Node;
			if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
			close(false);
		};
		const onMove = (e: Event) => {
			// Desplazar la propia lista no debe reubicar el panel.
			if (e.type === "scroll" && panelRef.current?.contains(e.target as Node)) return;
			place();
		};
		document.addEventListener("pointerdown", onPointer);
		window.addEventListener("resize", onMove);
		window.addEventListener("scroll", onMove, true);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			window.removeEventListener("resize", onMove);
			window.removeEventListener("scroll", onMove, true);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, place]);

	// Mantiene a la vista la fila activa al navegar con el teclado.
	useEffect(() => {
		if (!open) return;
		listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active, open]);

	function step(from: number, dir: 1 | -1): number {
		let i = from + dir;
		while (i >= 0 && i < visible.length && visible[i].disabled) i += dir;
		return i >= 0 && i < visible.length ? i : from;
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActive((i) => step(i, 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive((i) => step(i, -1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			choose(visible[active]);
		} else if (e.key === "Escape") {
			e.preventDefault();
			close();
		} else if (e.key === "Tab") {
			close(false);
		}
	}

	const text = triggerText ?? selectedOption?.label ?? "";

	return (
		<>
			<button
				ref={buttonRef}
				id={id}
				type="button"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={ariaLabel ? `${ariaLabel}: ${text}` : undefined}
				onClick={() => (open ? close() : openPanel())}
				className={`flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${triggerClassName}`}
			>
				<span className="min-w-0 flex-1 truncate">{text || " "}</span>
				<ChevronDown size={16} className="shrink-0 opacity-60" />
			</button>
			{/* Para formularios: el valor viaja por `name` y `required` se valida con el avisador nativo del navegador. */}
			{(name || required) && (
				<select
					tabIndex={-1}
					aria-hidden
					name={name}
					required={required}
					value={value}
					onChange={() => undefined}
					className="pointer-events-none absolute h-0 w-0 opacity-0"
				>
					{options.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			)}

			{open &&
				pos &&
				createPortal(
					<>
						{pos.sheet && <div className="fixed inset-0 z-[60] bg-black/40" aria-hidden />}
						<div
							ref={panelRef}
							tabIndex={-1}
							onKeyDown={onKeyDown}
							style={pos.sheet ? undefined : { top: pos.top, left: pos.left, width: pos.width }}
							className={`outline-none ${
								pos.sheet
									? "fixed inset-x-0 bottom-0 z-[70] flex max-h-[75dvh] flex-col rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl"
									: "fixed z-[70] flex max-h-[340px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
							}`}
						>
							{showSearch && (
								<div className="flex items-center gap-2 border-b border-border px-3">
									<Search size={16} className="shrink-0 text-ink-soft" />
									<input
										ref={inputRef}
										type="text"
										value={query}
										onChange={(e) => {
											setQuery(e.target.value);
											setActive(0);
										}}
										placeholder="Buscar"
										aria-label="Buscar"
										autoComplete="off"
										className="min-h-12 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-soft focus:outline-none sm:text-sm"
									/>
								</div>
							)}
							<ul ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
								{visible.map((o, i) => {
									const isSelected = o.value === value;
									const heading = o.group && o.group !== visible[i - 1]?.group ? o.group : null;
									return (
										<li key={`${o.value}:${i}`} role="presentation">
											{heading && <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{heading}</p>}
											<div
												role="option"
												aria-selected={isSelected}
												aria-disabled={o.disabled}
												data-index={i}
												onMouseEnter={() => !o.disabled && setActive(i)}
												onClick={() => choose(o)}
												className={`flex min-h-11 items-center justify-between gap-2 px-4 text-sm ${
													o.disabled ? "cursor-not-allowed text-ink-soft/60" : "cursor-pointer"
												} ${i === active && !o.disabled ? "bg-surface-alt" : ""} ${o.value === "" ? "text-ink-soft" : "text-ink"}`}
											>
												<span className="min-w-0 flex-1 truncate">{o.label}</span>
												{isSelected && <Check size={16} className="shrink-0 text-accent" />}
											</div>
										</li>
									);
								})}
								{visible.filter((o) => o.value !== "").length === 0 && options.some((o) => o.value !== "") && (
									<li className="px-4 py-3 text-sm text-ink-soft">Nada coincide con “{query}”.</li>
								)}
							</ul>
						</div>
					</>,
					document.body,
				)}
		</>
	);
}
