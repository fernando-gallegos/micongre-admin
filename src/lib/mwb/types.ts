export interface ParsedProgramPart {
	/** Número de la parte en la guía ("4." → 4). */
	number: number | null;
	title: string | null;
	durationMinutes: number | null;
	/** Texto instructivo completo de la parte (método, referencia de folleto,
	 * preguntas de análisis, etc.) — null para bible_reading/cbs, cuyo único
	 * párrafo ya se guarda completo en `title`. */
	description: string | null;
}

export interface ParsedProgram {
	/** Texto del encabezado tal cual aparece en la guía, ej. "6-12 de julio". */
	weekLabel: string;
	openingSongNumber: number | null;
	closingSongNumber: number | null;
	middleSongNumber: number | null;
	treasuresTalk: ParsedProgramPart;
	spiritualGems: ParsedProgramPart;
	bibleReading: ParsedProgramPart;
	studentParts: ParsedProgramPart[];
	/** Partes de "Nuestra vida cristiana" (sin el estudio bíblico), en el orden
	 * de la guía. La primera que no sea "Necesidades de la congregación" es
	 * `christian_living`, las demás `living_custom`. */
	livingParts: ParsedLivingPart[];
	cbs: ParsedProgramPart;
}

export interface ParsedLivingPart {
	kind: "christian_living" | "congregation_needs" | "living_custom";
	part: ParsedProgramPart;
}
