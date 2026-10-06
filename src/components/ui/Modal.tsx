"use client";

import { X } from "lucide-react";

// En móvil sube desde abajo como una hoja; en pantallas anchas es un diálogo centrado.
export function Modal({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
}) {
	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
			<div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-surface p-5 pb-8 shadow-xl sm:rounded-[28px] sm:p-6">
				<div className="mb-4 flex items-center justify-between gap-3">
					<h2 className="font-display text-xl font-medium text-ink">{title}</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Cerrar"
						className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface-alt"
					>
						<X size={20} />
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}
