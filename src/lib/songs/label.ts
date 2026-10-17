/** «Canción 65» o «Canción 65: título». Seguro de importar en cliente y servidor. */
export function songLabel(number: number | null | undefined, titles?: Map<number, string>): string | null {
	if (number == null) return null;
	const title = titles?.get(number);
	return title ? `Canción ${number}: ${title}` : `Canción ${number}`;
}
