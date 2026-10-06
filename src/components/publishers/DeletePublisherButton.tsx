"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";

// Un administrador nunca aparece habilitado para eliminar (ver también el
// bloqueo del lado del servidor en DELETE /api/publishers/[id]) — hay que
// quitarle el rol primero desde "Editar datos".
export function DeletePublisherButton({
	publisherId,
	fullName,
	isAdmin,
	onDeleted,
	redirectTo,
}: {
	publisherId: string;
	fullName: string;
	isAdmin: boolean;
	onDeleted?: () => void;
	// Al eliminar desde la ficha, a dónde ir (la ficha ya no existe).
	redirectTo?: string;
}) {
	const router = useRouter();
	const [modalOpen, setModalOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleDelete() {
		setDeleting(true);
		setError(null);
		const response = await fetch(`/api/publishers/${publisherId}`, { method: "DELETE" });
		setDeleting(false);
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { error?: string } | null;
			setError(body?.error ?? "No se pudo eliminar.");
			return;
		}
		setModalOpen(false);
		onDeleted?.();
		if (redirectTo) {
			router.push(redirectTo);
			router.refresh();
		}
	}

	return (
		<>
			<IconButton
				label={isAdmin ? "No se puede eliminar a un administrador" : "Eliminar"}
				icon={Trash2}
				tone="danger"
				disabled={isAdmin}
				onClick={() => setModalOpen(true)}
			/>

			<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Eliminar publicador">
				<div className="flex flex-col gap-3">
					<p className="text-sm text-ink-soft">
						¿Eliminar a <span className="font-medium text-ink">{fullName}</span>? Se borran también sus
						nombramientos, privilegios y datos de acceso. Esta acción no se puede deshacer.
					</p>
					{error && <p className="text-sm text-red-600">{error}</p>}
					<Button variant="danger" onClick={handleDelete} disabled={deleting}>
						{deleting ? "Eliminando..." : "Eliminar definitivamente"}
					</Button>
				</div>
			</Modal>
		</>
	);
}
