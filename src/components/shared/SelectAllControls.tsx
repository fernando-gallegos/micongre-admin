"use client";

/** Solo actúa sobre la selección de checkboxes en pantalla — el guardado
 * real (otorgar/revocar, abrir/terminar) lo hace el botón "Guardar" del
 * formulario que lo contiene. */
export function SelectAllControls({
	onSelectAll,
	onClearAll,
}: {
	onSelectAll: () => void;
	onClearAll: () => void;
}) {
	return (
		<div className="mb-3 flex gap-3">
			<button type="button" onClick={onSelectAll} className="text-xs font-medium text-accent hover:underline">
				Seleccionar todo
			</button>
			<button type="button" onClick={onClearAll} className="text-xs font-medium text-accent hover:underline">
				Quitar todo
			</button>
		</div>
	);
}
