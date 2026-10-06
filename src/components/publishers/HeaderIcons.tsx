"use client";

import { ArrowLeft, Eye, Pencil, Phone } from "lucide-react";
import { IconButton } from "@/components/ui/Layout";

// Botones de ícono de los encabezados de la ficha y de la tarjeta S-21. Viven en
// un componente cliente porque un ícono no se puede pasar desde una página de servidor.

export function BackIconButton({ href, label }: { href: string; label: string }) {
	return <IconButton label={label} icon={ArrowLeft} href={href} />;
}

export function CallIconButton({ phone }: { phone: string }) {
	return <IconButton label="Llamar" icon={Phone} href={`tel:${phone.replace(/[^\d+]/g, "")}`} />;
}

export function S21ModeButton({ href, editing }: { href: string; editing: boolean }) {
	return (
		<IconButton
			label={editing ? "Volver a la vista de solo lectura" : "Editar informes"}
			icon={editing ? Eye : Pencil}
			href={href}
			tone="accent"
		/>
	);
}
