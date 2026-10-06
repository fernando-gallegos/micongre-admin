// Superficie base: blanca sobre el fondo crema, sin borde ni sombra.
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
	return <div className={`rounded-[20px] bg-surface p-5 ${className}`}>{children}</div>;
}

export function Badge({
	children,
	tone = "neutral",
}: {
	children: React.ReactNode;
	tone?: "neutral" | "success" | "warning" | "danger";
}) {
	const toneClasses = {
		neutral: "bg-surface-alt text-ink-soft",
		success: "bg-accent-soft text-accent",
		warning: "bg-warn-soft text-warn",
		danger: "bg-red-100 text-red-800",
	}[tone];

	return (
		<span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses}`}>
			{children}
		</span>
	);
}
