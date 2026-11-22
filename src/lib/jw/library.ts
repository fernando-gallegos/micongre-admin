// Enlaces que abren JW Library directamente en un documento y párrafo, en lugar de wol.jw.org. Es el enlace «Compartir» de la app
// (https://www.jw.org/finder?…&docid=…&par=…): en el teléfono con JW Library instalada se abre en ella (probado en Android); si no,
// abre jw.org. El esquema jwlibrary:// no se usa: no todos los navegadores ni apps lo abren.

/** Idioma de las publicaciones (código de JW.ORG): la congregación usa español. */
const LOCALE = "S";

export function jwLibraryLink(docId: number, par?: number | null): string {
	return `https://www.jw.org/finder?srcid=jwlshare&wtlocale=${LOCALE}&prefer=lang&docid=${docId}${par ? `&par=${par}` : ""}`;
}

/** Enlace a una parte de la guía de actividades: el documento de la semana y el párrafo del encabezado de esa parte. */
export function mwbPartLink(docId: number | null, pars: string | null, partNumber: number | null): string | null {
	if (!docId || partNumber == null) return null;
	let byNumber: Record<string, number> = {};
	try {
		byNumber = pars ? (JSON.parse(pars) as Record<string, number>) : {};
	} catch {
		byNumber = {};
	}
	const par = byNumber[String(partNumber)];
	return par ? jwLibraryLink(docId, par) : null;
}

/**
 * Documento (MEPS docid) de cada bosquejo en «Bosquejos de discursos públicos» (S-34, español), por número de bosquejo — el título
 * cambia a veces, el número no. Sacado del archivo S-34_S.jwpub (tabla Document); el número no se puede calcular (p. ej. el 76).
 */
export const S34_DOC_IDS: Record<number, number> = {
	1: 1000000, 2: 1000001, 3: 1000002, 4: 1000003, 5: 1000004, 6: 1000005, 7: 1000006, 8: 1000007,
	9: 1000008, 10: 1000009, 11: 1000010, 12: 1000011, 13: 1000012, 14: 1000013, 15: 1000014, 16: 1000015,
	17: 1000016, 18: 1000017, 19: 1000018, 20: 1000019, 21: 1000020, 22: 1000021, 23: 1000022, 24: 1000023,
	25: 1000024, 26: 1000025, 27: 1000026, 28: 1000027, 29: 1000028, 30: 1000029, 31: 1000030, 32: 1000031,
	33: 1000032, 34: 1000033, 35: 1000034, 36: 1000035, 37: 1000036, 38: 1000037, 39: 1000038, 40: 1000039,
	41: 1000040, 42: 1000041, 43: 1000042, 44: 1000043, 45: 1000044, 46: 1000045, 47: 1000046, 48: 1000047,
	49: 1000048, 50: 1000049, 51: 1000050, 52: 1000051, 53: 1000052, 54: 1000053, 55: 1000054, 56: 1000055,
	57: 1000056, 58: 1000057, 59: 1000058, 60: 1000059, 61: 1000060, 62: 1000061, 63: 1000062, 64: 1000063,
	65: 1000064, 66: 1000065, 67: 1000066, 68: 1000067, 69: 1000068, 70: 1000069, 71: 1000070, 72: 1000071,
	73: 1000072, 74: 1000073, 75: 1000074, 76: 1000178, 77: 1000076, 78: 1000077, 79: 1000078, 80: 1000079,
	81: 1000080, 82: 1000081, 83: 1000082, 84: 1000083, 85: 1000084, 86: 1000085, 87: 1000086, 88: 1000087,
	89: 1000088, 90: 1000089, 91: 1000090, 92: 1000091, 93: 1000092, 94: 1000093, 95: 1000094, 96: 1000095,
	97: 1000096, 98: 1000097, 99: 1000098, 100: 1000099, 101: 1000100, 102: 1000101, 103: 1000102, 104: 1000103,
	105: 1000104, 106: 1000105, 107: 1000106, 108: 1000107, 109: 1000108, 110: 1000109, 111: 1000110, 112: 1000111,
	113: 1000112, 114: 1000113, 115: 1000114, 116: 1000115, 117: 1000116, 118: 1000117, 119: 1000118, 120: 1000119,
	121: 1000120, 122: 1000121, 123: 1000122, 124: 1000123, 125: 1000124, 126: 1000125, 127: 1000126, 128: 1000127,
	129: 1000128, 130: 1000129, 131: 1000130, 132: 1000131, 133: 1000132, 134: 1000133, 135: 1000134, 136: 1000135,
	137: 1000136, 138: 1000137, 139: 1000138, 140: 1000139, 141: 1000140, 142: 1000141, 143: 1000142, 144: 1000143,
	145: 1000144, 146: 1000145, 147: 1000146, 148: 1000147, 149: 1000148, 150: 1000149, 151: 1000150, 152: 1000151,
	153: 1000152, 154: 1000153, 155: 1000154, 156: 1000155, 157: 1000156, 158: 1000157, 159: 1000158, 160: 1000159,
	161: 1000160, 162: 1000161, 163: 1000162, 164: 1000163, 165: 1000164, 166: 1000165, 167: 1000166, 168: 1000167,
	169: 1000168, 170: 1000169, 171: 1000170, 172: 1000171, 173: 1000172, 174: 1000173, 175: 1000174, 176: 1000175,
	177: 1000176, 178: 1000177, 179: 1000179, 180: 1000180, 181: 1000181, 182: 1000182, 183: 1000183, 184: 1000184,
	185: 1000185, 186: 1000186, 187: 1000187, 188: 1000188, 189: 1000189, 190: 1000190, 191: 1000191, 192: 1000192,
	193: 1000193, 194: 1000194,
};

/** Enlace al bosquejo en el S-34 (solo lo abre quien tiene la publicación en JW Library). */
export function outlineLink(outlineNumber: number | string | null | undefined): string | null {
	const n = Number(outlineNumber);
	const docId = Number.isInteger(n) ? S34_DOC_IDS[n] : undefined;
	return docId ? jwLibraryLink(docId) : null;
}
