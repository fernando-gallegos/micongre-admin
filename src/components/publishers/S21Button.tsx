"use client";

import { IdCard } from "lucide-react";
import { IconButton } from "@/components/ui/Layout";

const LABEL = "Tarjeta de publicador (S-21)";

// "accent": Mi panel y el encabezado de la ficha; "row": acción de una fila.
export function S21Button({ userId, variant = "accent" }: { userId: string; variant?: "accent" | "row" }) {
	return <IconButton label={LABEL} icon={IdCard} href={`/publishers/${userId}/s21`} tone={variant === "accent" ? "accent" : "plain"} />;
}
