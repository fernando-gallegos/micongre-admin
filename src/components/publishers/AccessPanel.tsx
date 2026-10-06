"use client";

import { useState } from "react";
import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconButton, SectionLabel } from "@/components/ui/Layout";

export function AccessPanel({
	publisherId,
	username,
}: {
	publisherId: string;
	username: string | null;
}) {
	const [link, setLink] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [copied, setCopied] = useState(false);

	async function generateLink() {
		setLoading(true);
		setLink(null);
		setCopied(false);
		const response = await fetch(`/api/publishers/${publisherId}/access`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		setLoading(false);
		if (response.ok) {
			const body = (await response.json()) as { link: string };
			setLink(body.link);
		}
	}

	async function copyLink() {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
		} catch {
			// El navegador puede negar el acceso al portapapeles; el enlace
			// sigue visible en pantalla para copiarlo a mano.
		}
	}

	return (
		<section>
			<SectionLabel>Acceso a la app</SectionLabel>
			<Card className="flex flex-col gap-4">
				{username && (
					<p className="text-sm text-ink-soft">
						Usuario: <span className="font-semibold text-ink">{username}</span>
					</p>
				)}
				<p className="text-sm text-ink-soft">
					Comparte el enlace por WhatsApp, SMS o en persona — nunca por email. Al abrirlo, el publicador
					recibe usuario y contraseña generados automáticamente y queda con sesión iniciada.
				</p>
				<div>
					<Button
						onClick={generateLink}
						disabled={loading}
						variant="secondary"
						title={username ? "Genera un enlace nuevo y restablece el acceso actual" : undefined}
					>
						<Link2 size={18} />
						{loading ? "Generando..." : username ? "Nuevo enlace" : "Generar enlace"}
					</Button>
				</div>

				{link && (
					<div className="flex items-center gap-1 rounded-2xl bg-surface-alt py-1 pl-4 pr-1">
						<code className="flex-1 truncate text-xs text-ink-soft">{link}</code>
						{copied && <span className="text-xs font-medium text-accent">Copiado</span>}
						<IconButton label="Copiar enlace" icon={Copy} onClick={copyLink} />
					</div>
				)}
			</Card>
		</section>
	);
}
