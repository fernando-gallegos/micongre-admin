// Terminología de la Guía y el Cronograma de limpieza del Salón del Reino.
// Sin imports de servidor: se usa también desde componentes cliente.

export type CleaningKind = "ligera" | "profunda" | "a_fondo";
export type CleaningMeetingType = "midweek" | "weekend";

export const CLEANING_KIND_LABEL: Record<CleaningKind, string> = {
	ligera: "Limpieza ligera",
	profunda: "Limpieza profunda",
	a_fondo: "Limpieza a fondo",
};

export const CLEANING_KIND_FREQUENCY: Record<CleaningKind, string> = {
	ligera: "Después de cada reunión",
	profunda: "Cada semana",
	a_fondo: "Por lo menos una vez al año",
};

// Sugerencias del Cronograma para cada tipo.
export const CLEANING_KIND_HINT: Record<CleaningKind, string> = {
	ligera: "Puede realizarse asignando a los grupos de servicio.",
	profunda: "Coordinar entre las congregaciones para determinar qué semana le corresponde a cada una.",
	a_fondo: "Varias congregaciones pueden participar durante esta limpieza.",
};

export const CLEANING_MEETING_LABEL: Record<CleaningMeetingType, string> = {
	midweek: "entre semana",
	weekend: "fin de semana",
};

export const OWN_CONGREGATION_LABEL = "Nuestra congregación";

export interface CleaningGuide {
	equipment: string[];
	reminders: string[];
	areas: { title: string; items: string[] }[];
}

// Resumen de las Guías para la limpieza del Salón del Reino (05.26): áreas
// por tipo de limpieza, equipo requerido y recordatorios clave.
export const CLEANING_GUIDES: Record<CleaningKind, CleaningGuide> = {
	ligera: {
		equipment: [
			"Trapos de microfibra",
			"Escoba/recogedor o aspiradora",
			"Cubrebocas desechables",
			"Desinfectante multiusos o vinagre",
			"Guantes desechables",
			"Bolsas para basura",
			"Limpiavidrios",
		],
		reminders: [
			"Las asignaciones de limpieza son programadas por el coordinador de limpieza de cada congregación.",
			"Si hacen falta implementos de limpieza, comuníqueselo al coordinador de limpieza de la congregación.",
			"No utilizar desengrasantes y diluyentes. Evitar mezclar cloro con otros productos.",
			"Los productos de limpieza deben estar fuera del alcance de los niños.",
		],
		areas: [
			{ title: "Pisos", items: ["Barrer o aspirar alfombras/pisos del auditorio principal, salas auxiliares, plataforma y baños.", "Limpiar manchas visibles con trapeador de microfibra humedecido con desinfectante diluido."] },
			{ title: "Mobiliario y sillas", items: ["Ordenar las sillas del auditorio y mobiliario de plataforma.", "Desinfectar superficies que se tocan con frecuencia: perillas, brazos de sillas y puertas."] },
			{ title: "Baños", items: ["Desinfectar el interior de los inodoros y mingitorios con un cepillo y desinfectante diluido.", "Limpiar los asientos de los inodoros con microfibra y desinfectante."] },
			{ title: "Vidrios", items: ["Limpiar el vidrio de la sala auxiliar, los espejos de los baños y las puertas de vidrio."] },
			{ title: "Suministros y basura", items: ["Resurtir papel higiénico, toallas de papel y jabón.", "Tirar la basura y cambiar las bolsas de los botes.", "Retirar trapos utilizados, lavarlos y traerlos antes de la siguiente reunión."] },
		],
	},
	profunda: {
		equipment: [
			"Trapos de microfibra",
			"Señalización “Piso Mojado”",
			"Cepillo de dientes firme",
			"Bolsas de basura",
			"Escaleras",
			"Plumero",
			"Guantes desechables",
			"Cubrebocas desechables",
			"Gafas",
		],
		reminders: [
			"No trabajar en espacios elevados a una altura de 1,8 mts o más; en caso de ser necesario, contactar primero al capacitador de mantenimiento.",
			"La utilería deberá estar organizada y limpia en todo momento.",
			"En un Salón del Reino con varias congregaciones, el comité de mantenimiento asignará cada semana a una congregación para que realice la limpieza semanal, o distintas congregaciones realizarán parte de la limpieza profunda.",
		],
		areas: [
			{ title: "Realizar pasos de la limpieza ligera", items: ["Baño: grifería y herrajes con un cepillo de dientes.", "Pisos: trapear los pisos y quitar manchas superficiales en las juntas.", "Sillas: aspirar o limpiar con un cepillo suave las partes tapizadas."] },
			{ title: "Mobiliario de audio/video y literatura", items: ["Limpiar el mobiliario por dentro y por fuera y ordenar los equipos, cables y literatura."] },
			{ title: "Paredes", items: ["Desempolvar las paredes interiores y exteriores con un plumero o trapo de microfibra seco.", "Limpiar las manchas con un trapo limpio ligeramente húmedo y remover telarañas."] },
			{ title: "Puertas y ventanas", items: ["Desempolvar bordes y marcos; limpiar cerraduras y manijas con desinfectante diluido.", "Limpiar las protecciones de metal y persianas."] },
			{ title: "Ventilación y aire acondicionado", items: ["Una vez al mes, limpiar los difusores y rejillas del sistema.", "Limpiar los ventiladores con un plumero."] },
			{ title: "Exteriores", items: ["Barrer los andadores, limpiar los jardines y regar las plantas.", "Recoger y eliminar toda la basura que exista."] },
		],
	},
	a_fondo: {
		equipment: ["Equipo de jardinería", "Escaleras", "Plumero", "Guantes desechables", "Cubrebocas desechables"],
		reminders: [
			"El comité de mantenimiento deberá asignar encargados de seguridad para esta limpieza.",
			"Antes de realizar el trabajo, complete un Análisis de Riesgos (DC-85).",
			"Es preferible que la limpieza la realicen varias congregaciones en conjunto.",
			"La frecuencia dependerá de las circunstancias locales.",
		],
		areas: [
			{ title: "Realizar pasos de la limpieza profunda", items: ["Ventiladores y condensadores de A/C.", "Audio y video.", "Exteriores: cerco, enrejado o malla, letreros y horario de reuniones."] },
			{ title: "Techos y canalones", items: ["Organizar los trabajos para que sean supervisados por un experto.", "Remover basura, plagas y obstáculos del techo, canalones y bajantes."] },
			{ title: "Luminarias", items: ["Desconectar la energía eléctrica desde el tablero principal.", "Limpiar la cubierta de las luminarias con un plumero o trapo seco."] },
			{ title: "Equipos", items: ["Desconectar los equipos y apagar la energía eléctrica.", "Extractores, tanques de agua y cisternas."] },
			{ title: "Productos químicos", items: ["Guardar todos los productos químicos en sus envases adecuados.", "Identificarlos correctamente y colocarlos fuera del alcance de los niños."] },
			{ title: "Biblioteca y literatura", items: ["Retirar los libros de la biblioteca y del área de literatura.", "Limpiar los muebles con un paño seco y desechar la literatura en mal estado."] },
		],
	},
};

export const MONTH_NAMES_ES = [
	"enero",
	"febrero",
	"marzo",
	"abril",
	"mayo",
	"junio",
	"julio",
	"agosto",
	"septiembre",
	"octubre",
	"noviembre",
	"diciembre",
];

/** Semana del mes (0-4) de una semana, según su lunes: la N-ésima que empieza
 * en ese mes. Es la numeración 1–5 de las filas del Cronograma. */
export function weekOfMonthIndex(mondayISO: string): number {
	const day = Number(mondayISO.slice(8, 10));
	return Math.min(4, Math.floor((day - 1) / 7));
}
