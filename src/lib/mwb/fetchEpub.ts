// Descarga el EPUB de la Guía de actividades (mwb) desde el endpoint público de
// medios de JW.ORG — sin automatización de navegador, solo HTTP. Ver
// https://pubmedia.jw-api.org, usado por las apps oficiales para resolver
// enlaces de descarga.

export class MwbFetchError extends Error {}

const MEDIA_LINKS_URL = "https://pubmedia.jw-api.org/GETPUBMEDIALINKS";
const USER_AGENT = "jwlibrary-android";

interface MediaLinksResponse {
	files?: Record<string, { EPUB?: { file?: { url?: string } }[] }>;
}

export async function fetchMwbEpub(issue: string, lang = "S"): Promise<ArrayBuffer> {
	const linksUrl = `${MEDIA_LINKS_URL}?pub=mwb&issue=${issue}&fileformat=EPUB&langwritten=${lang}&output=json`;
	const linksResponse = await fetch(linksUrl, { headers: { "User-Agent": USER_AGENT } });
	if (!linksResponse.ok) {
		throw new MwbFetchError(`No se pudo consultar el catálogo de medios de JW.ORG (${linksResponse.status}).`);
	}

	const body = (await linksResponse.json().catch(() => null)) as MediaLinksResponse | null;
	const epubUrl = body?.files?.[lang]?.EPUB?.[0]?.file?.url;
	if (!epubUrl) {
		throw new MwbFetchError(`No hay una guía mwb publicada para el número ${issue}.`);
	}

	const epubResponse = await fetch(epubUrl, { headers: { "User-Agent": USER_AGENT } });
	if (!epubResponse.ok) {
		throw new MwbFetchError(`No se pudo descargar el archivo de la guía (${epubResponse.status}).`);
	}

	return epubResponse.arrayBuffer();
}
