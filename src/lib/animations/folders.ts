// Carpetas de animaciones de bienvenida. "todos" aplica a cualquier publicador; hombre/mujer según su sexo; las de Precursores solo se
// suman para el precursor regular (con el mismo criterio de sexo). Seguro de importar en servidor y cliente.
export const ANIMATION_FOLDERS = ["male", "female", "all", "pioneer_male", "pioneer_female", "pioneer_all"] as const;
export type AnimationFolder = (typeof ANIMATION_FOLDERS)[number];

export const ANIMATION_FOLDER_LABEL: Record<AnimationFolder, string> = {
	male: "Hombre",
	female: "Mujer",
	all: "Todos",
	pioneer_male: "Hombre",
	pioneer_female: "Mujer",
	pioneer_all: "Todos",
};

export const ANIMATION_GROUPS: { title: string; hint: string; folders: AnimationFolder[] }[] = [
	{ title: "Para todos los publicadores", hint: "«Todos» sale para cualquiera; «Hombre» y «Mujer» según el sexo de la persona.", folders: ["male", "female", "all"] },
	{ title: "Precursores regulares", hint: "Se suman a las de arriba, con el mismo criterio de sexo.", folders: ["pioneer_male", "pioneer_female", "pioneer_all"] },
];

/** Carpetas de las que puede salir la animación de una persona. */
export function foldersFor(gender: "male" | "female", regularPioneer: boolean): AnimationFolder[] {
	const folders: AnimationFolder[] = ["all", gender];
	if (regularPioneer) folders.push("pioneer_all", gender === "male" ? "pioneer_male" : "pioneer_female");
	return folders;
}

export const MAX_ANIMATION_BYTES = 1_000_000;
// Hasta 5 por carpeta: así cada persona tiene varias opciones (las de todas sus carpetas) y se elige una al azar.
export const MAX_ANIMATIONS_PER_FOLDER = 5;
/** Cada cuánto se vuelve a reproducir (cookie de "ya entró"): 5 minutos. */
export const ANIMATION_COOLDOWN_SECONDS = 5 * 60;
