import type { ReactNode } from "react";

// Soporte de Markdown a propósito reducido (sin librería externa, en línea
// con el resto de la app): negrita, cursiva, código en línea, links http(s),
// encabezados y listas. Los encabezados se renderizan a propósito con un
// tamaño chico — un "h1" real (text-3xl+) se comería el layout compacto de
// una tarjeta de notificación, así que aquí el nivel solo afecta el peso,
// nunca el tamaño de letra de todo el bloque.
const HEADING_CLASS: Record<number, string> = {
	1: "text-sm font-bold",
	2: "text-sm font-bold",
	3: "text-sm font-semibold",
	4: "text-sm font-semibold",
	5: "text-sm font-semibold",
	6: "text-sm font-semibold",
};

const INLINE_PATTERN = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|`(.+?)`|\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	let key = 0;
	INLINE_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = INLINE_PATTERN.exec(text))) {
		if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
		const k = `${keyPrefix}-${key++}`;
		if (match[1] !== undefined) nodes.push(<strong key={k}>{match[1]}</strong>);
		else if (match[2] !== undefined) nodes.push(<strong key={k}>{match[2]}</strong>);
		else if (match[3] !== undefined) nodes.push(<em key={k}>{match[3]}</em>);
		else if (match[4] !== undefined) nodes.push(<em key={k}>{match[4]}</em>);
		else if (match[5] !== undefined)
			nodes.push(
				<code key={k} className="rounded bg-surface-alt px-1 py-0.5 text-[0.85em]">
					{match[5]}
				</code>,
			);
		else if (match[6] !== undefined && match[7] !== undefined)
			nodes.push(
				<a key={k} href={match[7]} target="_blank" rel="noopener noreferrer" className="text-accent underline">
					{match[6]}
				</a>,
			);
		lastIndex = INLINE_PATTERN.lastIndex;
	}
	if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
	return nodes;
}

/** `article`: para textos largos (novedades), con títulos más grandes y más aire; por omisión, compacto (tarjeta de aviso). */
export function NotificationMarkdown({ message, variant = "compact" }: { message: string; variant?: "compact" | "article" }) {
	const article = variant === "article";
	const blocks = message.replace(/\r\n/g, "\n").split(/\n{2,}/);

	function renderLines(lines: string[], bi: number): ReactNode {
		const isUnordered = lines.every((l) => /^[-*]\s+/.test(l));
		const isOrdered = !isUnordered && lines.every((l) => /^\d+\.\s+/.test(l));
		if (isUnordered || isOrdered) {
			const items = lines.map((l, li) => <li key={li}>{renderInline(l.replace(/^([-*]|\d+\.)\s+/, ""), `b${bi}-${li}`)}</li>);
			return isOrdered ? (
				<ol key={`l${bi}`} className="list-decimal pl-5 text-[15px] text-ink">
					{items}
				</ol>
			) : (
				<ul key={`l${bi}`} className="list-disc pl-5 text-[15px] text-ink">
					{items}
				</ul>
			);
		}
		return (
			<p key={`p${bi}`} className="text-[15px] leading-snug text-ink">
				{lines.map((l, li) => (
					<span key={li}>
						{renderInline(l, `b${bi}-${li}`)}
						{li < lines.length - 1 && <br />}
					</span>
				))}
			</p>
		);
	}

	return (
		<div className={`flex flex-col ${article ? "gap-3" : "gap-1.5"}`}>
			{blocks.map((block, bi) => {
				const all = block.split("\n").filter((l) => l.trim().length > 0);
				if (all.length === 0) return null;
				// Un título puede ir solo o seguido de su texto en las líneas siguientes.
				const headingMatch = /^(#{1,6})\s+(.*)$/.exec(all[0]);
				const lines = headingMatch ? all.slice(1) : all;
				if (!headingMatch) return renderLines(lines, bi);
				const level = headingMatch[1].length;
				const headingClass = article ? (level <= 2 ? "mt-1 text-lg font-semibold" : "text-base font-semibold") : HEADING_CLASS[level];
				return (
					<div key={bi} className="flex flex-col gap-1">
						<p className={`${headingClass} text-ink`}>{renderInline(headingMatch[2], `b${bi}`)}</p>
						{lines.length > 0 && renderLines(lines, bi)}
					</div>
				);
			})}
		</div>
	);
}
