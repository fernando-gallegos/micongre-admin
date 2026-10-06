// Respaldo y restauración completos de los datos de la congregación.
//
// El respaldo es un JSON genérico: por cada tabla de la base, sus columnas y
// filas. No depende de una lista fija de tablas — se descubren en
// sqlite_master, así que las migraciones futuras quedan cubiertas solas. La
// restauración solo acepta tablas y columnas que existan en la base actual
// (los nombres del archivo se validan contra el esquema real antes de armar
// ningún SQL) y corre en UN solo batch de D1 (transacción: o entra todo o no
// cambia nada) con las llaves foráneas diferidas, para que el orden de las
// tablas no importe.

export const BACKUP_FORMAT = "micongre-backup";
export const BACKUP_VERSION = 1;

// Catálogos sembrados por las migraciones (privilegios y sus reglas por
// nombramiento): forman parte de la aplicación y "borrar todo" no los borra,
// pero SÍ se respaldan — la congregación les agrega filas propias (p. ej. las
// tareas operativas) a las que apuntan sus asignaciones, y al restaurar se
// actualizan en su sitio (INSERT OR REPLACE).
const CATALOG_TABLES = new Set(["privileges", "appointment_privilege_rules"]);
// Sesiones y enlaces de activación: ni se respaldan (restaurarlos reviviría
// accesos que ya no deberían existir) ni tiene sentido conservarlos al borrar.
const SESSION_TABLES = new Set(["refresh_tokens", "account_activation_tokens"]);
// Catálogo de bosquejos de discursos: se respalda (puede tener ediciones), pero
// "borrar todo" lo conserva — se siembra en una migración y no es de la congregación.
const KEEP_ON_WIPE = new Set([...CATALOG_TABLES, "public_talk_outlines"]);

const NAME_RE = /^[a-z_][a-z0-9_]*$/;
// Tope por sentencia INSERT: D1 limita cada consulta a 100 KB.
const MAX_STATEMENT_CHARS = 80_000;

type Cell = string | number | null;

export interface BackupFile {
	format: typeof BACKUP_FORMAT;
	version: number;
	createdAt: string;
	lastMigration: string | null;
	tables: Record<string, { columns: string[]; rows: Cell[][] }>;
}

async function listTables(d1: D1Database): Promise<string[]> {
	const { results } = await d1
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
		)
		.all<{ name: string }>();
	return results.map((r) => r.name).filter((n) => NAME_RE.test(n));
}

async function tableColumns(d1: D1Database, table: string): Promise<string[]> {
	// `table` viene de sqlite_master y pasó NAME_RE: no es entrada del usuario.
	const { results } = await d1.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
	return results.map((r) => r.name);
}

async function lastMigration(d1: D1Database): Promise<string | null> {
	try {
		const row = await d1.prepare("SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1").first<{ name: string }>();
		return row?.name ?? null;
	} catch {
		return null;
	}
}

export async function createBackup(d1: D1Database): Promise<BackupFile> {
	const tables: BackupFile["tables"] = {};
	for (const table of await listTables(d1)) {
		if (SESSION_TABLES.has(table)) continue;
		const columns = await tableColumns(d1, table);
		const { results } = await d1.prepare(`SELECT * FROM ${table}`).all<Record<string, Cell>>();
		tables[table] = { columns, rows: results.map((row) => columns.map((c) => row[c] ?? null)) };
	}
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		createdAt: new Date().toISOString(),
		lastMigration: await lastMigration(d1),
		tables,
	};
}

const DEFAULT_CONGREGATION_SQL = "INSERT OR IGNORE INTO congregations (id, name) VALUES ('main', 'Mi congregación');";

async function wipeStatements(d1: D1Database): Promise<string[]> {
	const statements: string[] = [];
	for (const table of await listTables(d1)) {
		if (KEEP_ON_WIPE.has(table)) continue;
		statements.push(`DELETE FROM ${table};`);
	}
	return statements;
}

function literal(value: Cell): string {
	if (value === null) return "NULL";
	if (typeof value === "number") return String(value);
	// SQLite no interpreta escapes con barra invertida dentro de literales.
	return `'${value.replace(/\0/g, "").replace(/'/g, "''")}'`;
}

// Una fila con un texto enorme (p. ej. el dibujo de un mapa) no cabe en una sola
// sentencia (D1: 100 KB). Se inserta con los textos largos recortados y el resto
// se les agrega con UPDATE ... SET col = col || '...' sobre la fila recién
// insertada (rowid), todo dentro del mismo batch.
const PIECE_CHARS = 40_000;

function splitText(text: string): string[] {
	const pieces: string[] = [];
	for (let i = 0; i < text.length; ) {
		let end = Math.min(i + PIECE_CHARS, text.length);
		// No partir un par sustituto (emoji): quedaría un carácter inválido.
		const code = text.charCodeAt(end - 1);
		if (end < text.length && code >= 0xd800 && code <= 0xdbff) end--;
		pieces.push(text.slice(i, end));
		i = end;
	}
	return pieces;
}

function insertOversizedRow(verb: string, table: string, columns: string[], row: Cell[]): string[] {
	const tails: { column: string; pieces: string[] }[] = [];
	const first = row.map((value, i) => {
		if (typeof value === "string" && value.length > PIECE_CHARS) {
			const pieces = splitText(value);
			tails.push({ column: columns[i] as string, pieces: pieces.slice(1) });
			return pieces[0] as string;
		}
		return value;
	});
	const statements = [`${verb} INTO ${table} (${columns.join(", ")}) VALUES (${first.map(literal).join(", ")});`];
	for (const { column, pieces } of tails) {
		for (const piece of pieces) {
			statements.push(`UPDATE ${table} SET ${column} = ${column} || ${literal(piece)} WHERE rowid = last_insert_rowid();`);
		}
	}
	return statements;
}

export function insertStatements(verb: string, table: string, columns: string[], rows: Cell[][]): string[] {
	const statements: string[] = [];
	const head = `${verb} INTO ${table} (${columns.join(", ")}) VALUES\n`;
	let chunk: string[] = [];
	let size = head.length;
	const flush = () => {
		if (chunk.length) statements.push(`${head}${chunk.join(",\n")};`);
		chunk = [];
		size = head.length;
	};
	for (const row of rows) {
		const tuple = `(${row.map(literal).join(", ")})`;
		if (head.length + tuple.length > MAX_STATEMENT_CHARS) {
			flush();
			statements.push(...insertOversizedRow(verb, table, columns, row));
			continue;
		}
		if (chunk.length && size + tuple.length > MAX_STATEMENT_CHARS) flush();
		chunk.push(tuple);
		size += tuple.length + 2;
	}
	flush();
	return statements;
}

/** Borra todos los datos de la congregación (todo salvo los catálogos), en una
 * sola transacción. Deja la fila única de `congregations` con sus valores de
 * fábrica. */
export async function wipeAllData(d1: D1Database): Promise<void> {
	const statements = ["PRAGMA defer_foreign_keys = true;", ...(await wipeStatements(d1)), DEFAULT_CONGREGATION_SQL];
	await d1.batch(statements.map((s) => d1.prepare(s)));
}

export type RestoreFailure = { error: "invalid_backup" | "restore_failed" };

export interface RestoreResult {
	tables: number;
	rows: number;
	byTable: Record<string, number>;
	/** Tablas/columnas del archivo que ya no existen en esta versión de la app. */
	skipped: string[];
	adminExists: boolean;
}

function isCell(v: unknown): v is Cell {
	return v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
}

/** Valida la forma del archivo (no su contenido de negocio). */
function parseBackup(raw: unknown): BackupFile | null {
	if (!raw || typeof raw !== "object") return null;
	const b = raw as Partial<BackupFile>;
	if (b.format !== BACKUP_FORMAT || b.version !== BACKUP_VERSION) return null;
	if (!b.tables || typeof b.tables !== "object" || Array.isArray(b.tables)) return null;
	for (const [name, t] of Object.entries(b.tables)) {
		if (!NAME_RE.test(name) || !t || !Array.isArray(t.columns) || !Array.isArray(t.rows)) return null;
		if (!t.columns.every((c) => typeof c === "string" && NAME_RE.test(c))) return null;
		for (const row of t.rows) {
			if (!Array.isArray(row) || row.length !== t.columns.length || !row.every(isCell)) return null;
		}
	}
	return b as BackupFile;
}

/** Restaura un respaldo sobre la base: borra los datos actuales y carga los
 * del archivo, todo en una transacción. */
export async function restoreBackup(d1: D1Database, raw: unknown): Promise<RestoreResult | RestoreFailure> {
	const backup = parseBackup(raw);
	if (!backup) return { error: "invalid_backup" };

	const statements = ["PRAGMA defer_foreign_keys = true;", ...(await wipeStatements(d1))];
	const skipped: string[] = [];
	const byTable: Record<string, number> = {};
	const existing = new Set(await listTables(d1));
	let rows = 0;

	for (const [table, data] of Object.entries(backup.tables)) {
		if (SESSION_TABLES.has(table)) continue;
		if (!existing.has(table)) {
			skipped.push(`tabla ${table}`);
			continue;
		}
		const actual = new Set(await tableColumns(d1, table));
		const keep = data.columns.map((c, i) => ({ c, i })).filter(({ c }) => actual.has(c));
		for (const c of data.columns) if (!actual.has(c)) skipped.push(`columna ${table}.${c}`);
		if (!keep.length || !data.rows.length) continue;

		const columns = keep.map((k) => k.c);
		const projected = data.rows.map((r) => keep.map((k) => r[k.i]));
		// Los catálogos que se conservan al borrar se actualizan en su sitio.
		const verb = KEEP_ON_WIPE.has(table) ? "INSERT OR REPLACE" : "INSERT";
		statements.push(...insertStatements(verb, table, columns, projected));
		byTable[table] = data.rows.length;
		rows += data.rows.length;
	}
	statements.push(DEFAULT_CONGREGATION_SQL);

	try {
		await d1.batch(statements.map((s) => d1.prepare(s)));
	} catch (error) {
		console.error("Backup restore failed", error);
		return { error: "restore_failed" };
	}

	const admin = await d1.prepare("SELECT 1 AS x FROM users WHERE system_role = 'admin' LIMIT 1").first();
	return { tables: Object.keys(byTable).length, rows, byTable, skipped, adminExists: !!admin };
}
