import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Tooltip } from "./Tooltip";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
	primary: "bg-accent text-accent-ink hover:bg-accent-strong",
	secondary: "border border-border bg-transparent text-ink hover:bg-surface-alt",
	ghost: "bg-transparent text-ink hover:bg-surface-alt",
	danger: "bg-red-600 text-white hover:bg-red-700",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
}

// Botón en píldora, con alto táctil mínimo de 44 px. Un `title` se muestra como
// globito (Tooltip), no como el tooltip nativo.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = "primary", className = "", title, ...props },
	ref,
) {
	const button = (
		<button
			ref={ref}
			className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
			{...props}
		/>
	);
	return title ? <Tooltip content={title}>{button}</Tooltip> : button;
});
