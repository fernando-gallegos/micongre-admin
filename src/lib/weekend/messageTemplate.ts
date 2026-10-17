// Plantillas del mensaje para oradores del fin de semana. Texto con palabras clave entre llaves, p. ej. {orador}. Seguro de importar en cliente y servidor.

export type MessageKind = "incoming" | "outgoing";

export interface MessageKeyword {
	key: string;
	label: string;
	example: string;
}

export const MESSAGE_KEYWORDS: MessageKeyword[] = [
	{ key: "orador", label: "Nombre del orador", example: "Ismael Machado" },
	{ key: "congregacion_orador", label: "Congregación del orador", example: "Pancasán-Granada, Gda." },
	{ key: "congregacion_destino", label: "Congregación destino (donde se da el discurso)", example: "El Mirador SJO" },
	{ key: "dia", label: "Día de la semana de la reunión", example: "sábado" },
	{ key: "fecha", label: "Fecha de la reunión", example: "17 de octubre de 2026" },
	{ key: "hora", label: "Hora de la reunión", example: "4:30 p.m." },
	{ key: "bosquejo_numero", label: "Número del bosquejo", example: "35" },
	{ key: "bosquejo_titulo", label: "Título del bosquejo", example: "¿Se puede vivir para siempre? ¿Lo logrará usted?" },
	{ key: "cancion", label: "Canción del discurso", example: "Canción 65: Sigamos adelante" },
	{ key: "direccion", label: "Dirección del salón donde se da el discurso", example: "Del parque 2 cuadras al sur" },
];

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
	incoming: "Orador invitado que llega",
	outgoing: "Orador local que sale",
};

export const DEFAULT_TEMPLATES: Record<MessageKind, string> = {
	incoming: [
		"Hola {orador}, gracias por aceptar dar el discurso público en {congregacion_destino}.",
		"Será el {dia} {fecha} a las {hora}",
		"Discurso {bosquejo_numero}: {bosquejo_titulo}",
		"{cancion}",
		"Dirección del salón: {direccion}",
		"¡Que Jehová lo bendiga!",
	].join("\n"),
	outgoing: [
		"Hola {orador}, te recuerdo que el {dia} {fecha} a las {hora} darás el discurso público en {congregacion_destino}.",
		"Discurso {bosquejo_numero}: {bosquejo_titulo}",
		"{cancion}",
		"Dirección del salón: {direccion}",
		"¡Gracias por tu apoyo!",
	].join("\n"),
};

const PLACEHOLDER = /\{([a-z_]+)\}/g;

/** Reemplaza las palabras clave. Una línea cuyas palabras clave quedaron todas vacías se omite (p. ej. «Dirección del salón: {direccion}» sin dirección). */
export function renderTemplate(body: string, values: Record<string, string | null | undefined>): string {
	const lines = body.replace(/\r\n/g, "\n").split("\n");
	const out: string[] = [];
	for (const line of lines) {
		const keys = [...line.matchAll(PLACEHOLDER)].map((m) => m[1]);
		const known = keys.filter((k) => k in values);
		if (known.length > 0 && known.every((k) => !(values[k] ?? "").toString().trim())) continue;
		out.push(
			line
				.replace(PLACEHOLDER, (whole, key: string) => (key in values ? ((values[key] ?? "") as string) : whole))
				.replace(/[ \t]{2,}/g, " ")
				.replace(/(?<!\.)\.\.(?!\.)/g, ".")
				.trimEnd(),
		);
	}
	return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function exampleValues(): Record<string, string> {
	return Object.fromEntries(MESSAGE_KEYWORDS.map((k) => [k.key, k.example]));
}
