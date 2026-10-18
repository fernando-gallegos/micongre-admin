// Cliente del JW Hub (hub.jw.org/meetings). Su API `meeting-search` es pública
// (sin autenticación): dados el GUID de ubicación y el de la congregación
// devuelve nombre, dirección, teléfono, GPS y el día/hora de cada reunión.

export const JW_HUB_SEARCH_URL = "https://hub.jw.org/meetings/es";

const HUB_HOST = "hub.jw.org";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class JwHubError extends Error {
	constructor(public code: "invalid_url" | "search_link" | "not_found" | "unavailable") {
		super(code);
	}
}

export interface HubCongregation {
	jwLocationId: string;
	jwEventId: string;
	name: string;
	address: string | null;
	phone: string | null;
	latitude: number | null;
	longitude: number | null;
	midweekMeetingDay: number | null;
	midweekMeetingTime: string | null;
	weekendMeetingDay: number | null;
	weekendMeetingTime: string | null;
}

interface HubMeeting {
	id: string;
	name: string;
	midweekMeetingDay?: number;
	midweekMeetingTime?: string;
	weekendMeetingDay?: number;
	weekendMeetingTime?: string;
	address?: string;
	phoneNumber?: string;
}

interface HubSearchResponse {
	items?: {
		id: string;
		latitude?: number;
		longitude?: number;
		congregationMeetings?: HubMeeting[];
	}[];
}

const HUB_URL_IN_TEXT = /https?:\/\/hub\.jw\.org\/[^\s"'<>]+/i;

/**
 * El enlace del Hub dentro de lo que pegó la persona: puede ser solo el enlace, o el texto completo que copia JW.ORG desde el teléfono
 * («Compartir»: nombre, horarios, dirección, coordenadas y, al final, el enlace con espacios o saltos de línea alrededor). Devuelve el enlace limpio.
 */
export function extractHubUrl(raw: string): string {
	const match = HUB_URL_IN_TEXT.exec(raw);
	if (!match) throw new JwHubError("invalid_url");
	// Si el texto siguió pegado al enlace (p. ej. un punto o paréntesis al final), se recorta.
	return match[0].replace(/[.,;:)\]}]+$/, "");
}

/**
 * Extrae los GUID de un enlace del Hub. Acepta el enlace de "Compartir"
 * (`.../goto/entry-point/meetings?scope_id=…&eventId=…`), la URL que ve el
 * navegador (`...?locationId=…&eventId=…`) y el texto completo que copia JW.ORG
 * con el enlace dentro. Un enlace de BÚSQUEDA (`.../meetings/es?q={"location":"…"}`, el que se
 * copia desde la lista de resultados) no identifica una congregación: se avisa con `search_link`.
 */
export function parseHubUrl(raw: string): { locationId: string; eventId: string | null } {
	let url: URL;
	try {
		url = new URL(extractHubUrl(raw));
	} catch (error) {
		if (error instanceof JwHubError) throw error;
		throw new JwHubError("invalid_url");
	}
	if (url.hostname !== HUB_HOST) throw new JwHubError("invalid_url");

	const locationId = url.searchParams.get("scope_id") ?? url.searchParams.get("locationId");
	const eventId = url.searchParams.get("eventId");
	if (!locationId && url.searchParams.has("q")) throw new JwHubError("search_link");
	if (!locationId || !GUID.test(locationId) || (eventId && !GUID.test(eventId))) {
		throw new JwHubError("invalid_url");
	}
	return { locationId: locationId.toLowerCase(), eventId: eventId ? eventId.toLowerCase() : null };
}

// "18:30:00" -> "18:30"
function toHourMinute(value: string | undefined): string | null {
	return value ? value.slice(0, 5) : null;
}

export async function fetchHubCongregation(locationId: string, eventId: string | null): Promise<HubCongregation> {
	const params = new URLSearchParams({ meetingLocationGuid: locationId });
	if (eventId) params.set("meetingLocationEventGuid", eventId);

	let data: HubSearchResponse;
	try {
		const response = await fetch(`https://${HUB_HOST}/meetings/api/meeting-search?${params}`, {
			headers: { Accept: "application/json" },
		});
		if (!response.ok) throw new Error(String(response.status));
		data = (await response.json()) as HubSearchResponse;
	} catch {
		throw new JwHubError("unavailable");
	}

	const location = data.items?.find((item) => item.id.toLowerCase() === locationId);
	const meetings = location?.congregationMeetings ?? [];
	// Sin eventId, sólo es válido si la ubicación tiene una única congregación.
	const meeting = eventId ? meetings.find((m) => m.id.toLowerCase() === eventId) : meetings.length === 1 ? meetings[0] : undefined;
	if (!location || !meeting) throw new JwHubError(meetings.length > 1 ? "invalid_url" : "not_found");

	return {
		jwLocationId: locationId,
		jwEventId: meeting.id.toLowerCase(),
		name: meeting.name.trim(),
		address: meeting.address?.replace(/\r/g, "").trim() || null,
		phone: meeting.phoneNumber?.trim() || null,
		latitude: location.latitude ?? null,
		longitude: location.longitude ?? null,
		midweekMeetingDay: meeting.midweekMeetingDay ?? null,
		midweekMeetingTime: toHourMinute(meeting.midweekMeetingTime),
		weekendMeetingDay: meeting.weekendMeetingDay ?? null,
		weekendMeetingTime: toHourMinute(meeting.weekendMeetingTime),
	};
}

/** Columnas de `speaker_congregations` que se rellenan desde el Hub. */
export function hubCongregationColumns(hub: HubCongregation, jwUrl: string) {
	return {
		name: hub.name,
		phone: hub.phone,
		jwUrl,
		jwLocationId: hub.jwLocationId,
		jwEventId: hub.jwEventId,
		address: hub.address,
		latitude: hub.latitude,
		longitude: hub.longitude,
		midweekMeetingDay: hub.midweekMeetingDay,
		midweekMeetingTime: hub.midweekMeetingTime,
		weekendMeetingDay: hub.weekendMeetingDay,
		weekendMeetingTime: hub.weekendMeetingTime,
		jwSyncedAt: new Date(),
	};
}
