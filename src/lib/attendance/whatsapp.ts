/** Mensaje de WhatsApp con la asistencia de una reunión. Se abre con wa.me y la persona elige en WhatsApp el chat o grupo. */
export function attendanceMessage(label: string, dateText: string, inPerson: number, zoom: number): string {
	const lines = [`*Asistencia · ${label}*`, `_${dateText}_`, "", `🏛️ En el salón: ${inPerson}`];
	if (zoom > 0) lines.push(`💻 Por Zoom: ${zoom}`);
	lines.push(`*Total: ${inPerson + zoom}*`);
	return lines.join("\n");
}

export const whatsappShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
