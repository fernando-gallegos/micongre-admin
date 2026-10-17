"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Input";

interface Song {
	number: number;
	title: string;
}

// Un solo pedido del catálogo por carga de página, compartido por todos los selectores.
let cache: Promise<Song[]> | null = null;
function loadSongs(): Promise<Song[]> {
	cache ??= fetch("/api/weekend/songs")
		.then(async (r) => (r.ok ? (((await r.json()) as { items: Song[] }).items ?? []) : []))
		.catch(() => []);
	return cache;
}

/** Catálogo de canciones (número → título) para mostrar «Canción 65: título»; vacío mientras carga. */
export function useSongTitles(): Map<number, string> {
	const [songs, setSongs] = useState<Song[]>([]);
	useEffect(() => {
		let active = true;
		loadSongs().then((s) => active && setSongs(s));
		return () => {
			active = false;
		};
	}, []);
	return new Map(songs.map((s) => [s.number, s.title]));
}

/** Selector de canción del catálogo (con buscador). Si todavía no se importó el catálogo, deja escribir el número. */
export function SongSelect({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number | null;
	onChange: (song: number | null) => void;
}) {
	const [songs, setSongs] = useState<Song[] | null>(null);
	useEffect(() => {
		let active = true;
		loadSongs().then((s) => active && setSongs(s));
		return () => {
			active = false;
		};
	}, []);

	if (songs !== null && songs.length === 0) {
		return (
			<label className="flex flex-col gap-1 text-sm">
				<span className="font-medium text-ink">{label}</span>
				<input
					type="number"
					min={1}
					inputMode="numeric"
					value={value ?? ""}
					onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
					className="h-12 rounded-full border border-border bg-surface px-4 text-base text-ink sm:text-sm"
				/>
			</label>
		);
	}

	return (
		<Select label={label} value={value != null ? String(value) : ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
			<option value="">Sin canción</option>
			{/* Si el número guardado no está en el catálogo (aún sin importar), igual se muestra. */}
			{value != null && !(songs ?? []).some((s) => s.number === value) && <option value={value}>{value}</option>}
			{(songs ?? []).map((s) => (
				<option key={s.number} value={s.number}>
					{s.number}. {s.title}
				</option>
			))}
		</Select>
	);
}
