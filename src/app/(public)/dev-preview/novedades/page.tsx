import { notFound } from "next/navigation";
import { WhatsNew, type WhatsNewItem } from "@/components/announcements/WhatsNew";

// Vista previa de la pantalla de novedades con datos de ejemplo. Solo con `next dev` (el middleware la deja pasar solo ahí).
const SAMPLE: WhatsNewItem[] = [
	{
		id: "preview-imagen",
		title: "¿Qué hay de nuevo?",
		image: "/dev-preview/novedad-ejemplo.jpg",
		intro: "Mejoras para preparar los programas de las reuniones.",
		body: [
			"## Vista mensual de los programas",
			"En **Entre semana**, **Fin de semana** y **Acomodadores**, el botón *Vista mensual* abre todo el mes en una tabla a pantalla completa.",
			"",
			"- Las asignaciones a la izquierda y las reuniones arriba.",
			"- Se asigna y se guarda **todo de una vez**.",
			"",
			"## Reportes por rango de fechas",
			"Además de «Esta semana» y «Todo el mes», el botón de reporte permite elegir *Desde* y *Hasta*.",
			"",
			"## Guardar es más rápido",
			"Los programas guardan varias asignaciones a la vez. Si alguna no se guarda, se indica cuál y por qué.",
			"",
			"Más información en [jw.org](https://www.jw.org).",
		].join("\n"),
		items: [],
	},
	{
		id: "preview-sin-imagen",
		title: "¿Qué hay de nuevo?",
		image: null,
		intro: "Sin imagen: así se ve con el encabezado de color.",
		body: "Texto con **negritas** y *cursiva*.\n\n- Primer punto\n- Segundo punto",
		items: [],
	},
];

export default function WhatsNewPreviewPage() {
	if (process.env.NODE_ENV !== "development") notFound();
	return (
		<div className="min-h-dvh bg-bg p-6 text-ink-soft">
			<p>Vista previa de «¿Qué hay de nuevo?» (solo desarrollo).</p>
			<WhatsNew preview={SAMPLE} />
		</div>
	);
}
