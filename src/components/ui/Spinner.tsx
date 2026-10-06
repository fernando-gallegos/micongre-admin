/** Anillo giratorio en el color de acento. */
export function Spinner({ size = 32, className = "" }: { size?: number; className?: string }) {
	return (
		<svg
			role="status"
			aria-label="Cargando"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			className={`animate-spin text-accent ${className}`}
		>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
			<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}

/** Cargando una página: el spinner va en el centro de la pantalla (sin tapar la
 * navegación) y desaparece solo cuando el componente deja de renderizarse. */
export function PageLoader() {
	return (
		<div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center md:pl-60">
			<Spinner size={40} />
		</div>
	);
}

/** Cargando una sección pequeña (tarjeta, ventana): spinner centrado en su espacio. */
export function InlineLoader() {
	return (
		<div className="flex items-center justify-center py-8">
			<Spinner size={28} />
		</div>
	);
}
