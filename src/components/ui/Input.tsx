import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes } from "react";

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

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
	label?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
	{ label, className = "", children, ...props },
	ref,
) {
	return (
		<label className="flex flex-col gap-1 text-sm">
			{label && <span className="font-medium text-ink">{label}</span>}
			<select
				ref={ref}
				className={`min-h-12 rounded-2xl border border-border bg-surface px-4 py-2 text-base text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm ${className}`}
				{...props}
			>
				{children}
			</select>
		</label>
	);
});

export function FieldLabel(props: LabelHTMLAttributes<HTMLLabelElement>) {
	return <label className="text-sm font-medium text-ink" {...props} />;
}
