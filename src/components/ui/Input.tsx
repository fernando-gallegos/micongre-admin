"use client";

import { Children, forwardRef, Fragment, isValidElement, useMemo, useState, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from "react";
import { Combobox, type ComboOption } from "./Combobox";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
	label?: string;
	error?: string;
}

export const Input = forwardRef<HTMLInputElement, FieldProps>(function Input(
	{ label, error, className = "", id, ...props },
	ref,
) {
	return (
		<label className="flex flex-col gap-1 text-sm">
			{label && <span className="font-medium text-ink">{label}</span>}
			<input
				ref={ref}
				id={id}
				className={`min-h-12 rounded-2xl border border-border bg-surface px-4 py-2 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm ${className}`}
				{...props}
			/>
			{error && <span className="text-xs text-red-600">{error}</span>}
		</label>
	);
});

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
	label?: string;
	/** Mismo contrato que el <select> nativo: el manejador recibe un evento con `e.target.value`. */
	onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

function textOf(node: ReactNode): string {
	if (node === null || node === undefined || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
	return "";
}

/** Convierte los hijos <option>/<optgroup> de un <select> en opciones del Combobox. */
function parseOptions(children: ReactNode, group?: string): ComboOption[] {
	const out: ComboOption[] = [];
	Children.forEach(children, (child) => {
		if (!isValidElement(child)) return;
		const props = child.props as { value?: string | number; disabled?: boolean; label?: string; children?: ReactNode };
		if (child.type === "option") {
			const label = textOf(props.children);
			out.push({ value: props.value !== undefined ? String(props.value) : label, label, disabled: props.disabled, group });
		} else if (child.type === "optgroup") {
			out.push(...parseOptions(props.children, props.label));
		} else if (child.type === Fragment) {
			out.push(...parseOptions(props.children, group));
		}
	});
	return out;
}

/** <select> con buscador (sin etiqueta): mismas propiedades que el nativo, con las <option> como hijos. `className` da el estilo del campo. */
export const SelectBox = forwardRef<HTMLButtonElement, SelectProps>(function SelectBox(
	{ className = "", children, value, defaultValue, onChange, disabled, name, id, required, "aria-label": ariaLabel },
	_ref,
) {
	const options = useMemo(() => parseOptions(children), [children]);
	const [inner, setInner] = useState(String(defaultValue ?? ""));
	const current = value !== undefined ? String(value) : inner;
	return (
		<Combobox
			options={options}
			value={current}
			disabled={disabled}
			name={name}
			id={id}
			required={required}
			ariaLabel={ariaLabel}
			triggerClassName={className}
			onChange={(next) => {
				setInner(next);
				onChange?.({ target: { value: next, name: name ?? "" }, currentTarget: { value: next, name: name ?? "" } } as unknown as React.ChangeEvent<HTMLSelectElement>);
			}}
		/>
	);
});

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select({ label, className = "", ...props }, ref) {
	return (
		<div className="flex flex-col gap-1 text-sm">
			{label && <span className="font-medium text-ink">{label}</span>}
			<SelectBox
				ref={ref}
				aria-label={label}
				className={`min-h-12 w-full rounded-2xl border border-border bg-surface px-4 py-2 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm ${className}`}
				{...props}
			/>
		</div>
	);
});

export function FieldLabel(props: LabelHTMLAttributes<HTMLLabelElement>) {
	return <label className="text-sm font-medium text-ink" {...props} />;
}
