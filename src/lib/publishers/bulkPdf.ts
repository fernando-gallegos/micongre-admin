// Solo cliente: tablas de privilegios y de nombramientos (personas a la izquierda, privilegios/nombramientos arriba, ✔ donde aplica)
// como página imprimible en horizontal; el navegador la guarda como PDF desde el diálogo de impresión.

export interface PdfPerson {
	fullName: string;
	appointments: string[];
	privilegeIds: string[];
}

function esc(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function table(title: string, people: PdfPerson[], columns: { key: string; label: string }[], has: (p: PdfPerson, key: string) => boolean): string {
	// Solo columnas que alguien de la lista tiene: así la tabla no se llena de columnas vacías.
	const used = columns.filter((c) => people.some((p) => has(p, c.key)));
	if (used.length === 0) return `<section><h2>${esc(title)}</h2><p class="empty">Nadie de la lista tiene ${esc(title.toLowerCase())}.</p></section>`;
	const head = used.map((c) => `<th class="v"><div>${esc(c.label)}</div></th>`).join("");
	const body = people
		.map((p) => `<tr><td class="n">${esc(p.fullName)}</td>${used.map((c) => `<td class="c">${has(p, c.key) ? "✔" : ""}</td>`).join("")}</tr>`)
		.join("");
	return `<section><h2>${esc(title)}</h2><table><thead><tr><th class="n">Persona</th>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
}

export function printBulkTables(opts: {
	people: PdfPerson[];
	privileges?: { id: string; name: string }[];
	appointments?: { type: string; label: string }[];
}): boolean {
	const date = new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
	const sections: string[] = [];
	if (opts.privileges) {
		sections.push(
			table("Privilegios", opts.people, opts.privileges.map((p) => ({ key: p.id, label: p.name })), (p, k) => p.privilegeIds.includes(k)),
		);
	}
	if (opts.appointments) {
		sections.push(
			table("Nombramientos", opts.people, opts.appointments.map((a) => ({ key: a.type, label: a.label })), (p, k) => p.appointments.includes(k)),
		);
	}
	const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Privilegios y nombramientos</title><style>
@page { size: letter landscape; margin: 10mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10px; margin: 0; }
h1 { font-size: 14px; margin: 0 0 2px; }
.date { color: #666; margin: 0 0 8px; }
section { page-break-after: always; }
section:last-of-type { page-break-after: auto; }
h2 { font-size: 12px; margin: 6px 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #999; padding: 2px 4px; }
th.v { height: 150px; width: 22px; padding: 2px; vertical-align: bottom; }
th.v div { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; margin: 0 auto; font-weight: 600; }
th.n { text-align: left; vertical-align: bottom; }
td.n { white-space: nowrap; }
td.c { text-align: center; font-size: 11px; }
tr { page-break-inside: avoid; }
tbody tr:nth-child(even) { background: #f3f3f3; }
.empty { color: #666; }
</style></head><body><h1>Privilegios y nombramientos</h1><p class="date">${esc(date)} · ${opts.people.length} personas</p>${sections.join("")}</body></html>`;

	const frame = document.createElement("iframe");
	frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
	document.body.appendChild(frame);
	const doc = frame.contentDocument;
	if (!doc || !frame.contentWindow) {
		frame.remove();
		return false;
	}
	doc.open();
	doc.write(html);
	doc.close();
	const win = frame.contentWindow;
	setTimeout(() => {
		win.focus();
		win.print();
		setTimeout(() => frame.remove(), 60_000);
	}, 250);
	return true;
}
