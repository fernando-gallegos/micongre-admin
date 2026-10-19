// Enlaces para contactar a alguien desde su número guardado: llamada, SMS y WhatsApp.
// Los números se guardan como la persona los escribió («8888-9999», «+505 8888 9999», «(505) 88889999»…); aquí se normalizan
// al formato internacional. Un número local de Nicaragua (8 dígitos) recibe el código de país 505.

export const DEFAULT_COUNTRY_CODE = "505";
const LOCAL_DIGITS = 8;

/** Solo dígitos, con el código de país. null si no parece un número de teléfono. */
export function internationalDigits(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string | null {
	if (!raw) return null;
	let digits = raw.replace(/\D/g, "");
	if (raw.trim().startsWith("00")) digits = digits.slice(2); // 00505… = +505…
	if (digits.length < 7) return null;
	if (digits.length === LOCAL_DIGITS) digits = countryCode + digits; // número local sin código de país
	return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export interface ContactLinks {
	/** «+505 8888 9999», para mostrar. */
	display: string;
	tel: string;
	sms: string;
	whatsapp: string;
}

export function contactLinks(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): ContactLinks | null {
	const digits = internationalDigits(raw, countryCode);
	if (!digits) return null;
	const local = digits.startsWith(countryCode) ? digits.slice(countryCode.length) : null;
	const display = local && local.length === LOCAL_DIGITS ? `+${countryCode} ${local.slice(0, 4)} ${local.slice(4)}` : `+${digits}`;
	return { display, tel: `tel:+${digits}`, sms: `sms:+${digits}`, whatsapp: `https://wa.me/${digits}` };
}
