// Novedades («¿Qué hay de nuevo?»). Se muestran una sola vez a cada persona (al cerrarla no vuelve a salir) y solo cuando están
// publicadas: se escriben con `published: false` y se cambian a `true` cuando se decide anunciarlas (y se despliega).
// `audience`: "all" = todos, "appointed" = ancianos y siervos ministeriales, "admins" = solo administradores.
// El `id` es permanente: no se cambia ni se reutiliza (con él se recuerda quién ya la vio).
// Opcional: `image` (en public/announcements/, se ve a todo el ancho y 200 px de alto; recomendado 1200 × 600 px con lo importante en el
// centro) y `body` en Markdown sencillo (**negrita**, *cursiva*, ## títulos, listas «- », [enlaces](https://…)). `items` sigue sirviendo.
import type { Announcement } from "./rules";

export const ANNOUNCEMENTS: Announcement[] = [
	{
		id: "2026-11-planificadores",
		audience: "appointed",
		published: false,
		title: "¿Qué hay de nuevo?",
		intro: "Mejoras para preparar los programas de las reuniones.",
		items: [
			{
				title: "Vista mensual de los programas",
				text: "En Entre semana, Fin de semana y Acomodadores, el botón «Vista mensual» abre todo el mes en una tabla a pantalla completa: las asignaciones a la izquierda y las reuniones arriba. Se asigna y se guarda todo de una vez.",
			},
			{
				title: "Reportes por rango de fechas",
				text: "Además de «Esta semana» y «Todo el mes», el botón de reporte permite elegir «Desde» y «Hasta».",
			},
			{
				title: "Guardar es más rápido",
				text: "Los programas guardan varias asignaciones a la vez. Si alguna no se guarda, se indica cuál y por qué.",
			},
			{
				title: "JW Library desde el programa",
				text: "En Reuniones, las partes de entre semana, el estudio de La Atalaya y el bosquejo del discurso público abren JW Library.",
			},
		],
	},
];
