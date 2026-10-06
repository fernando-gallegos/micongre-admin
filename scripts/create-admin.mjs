#!/usr/bin/env node
// Bootstrap del primer administrador: no hay forma de generar un enlace de
// activación sin que ya exista un admin, así que este script crea uno
// directamente contra D1 local (o remoto, con --remote) usando el mismo
// esquema de hash (PBKDF2-SHA256) que src/lib/auth/password.ts.
import { execSync } from "node:child_process";

const [, , fullName, username, password, ...flags] = process.argv;

if (!fullName || !username || !password) {
	console.error('Uso: node scripts/create-admin.mjs "Nombre Completo" usuario contraseña [--remote] [--hidden]');
	process.exit(1);
}

const remote = flags.includes("--remote");
// --hidden: administra todo pero no cuenta como Publicador en ningún lado (ver
// migrations/0022_hidden_admin.sql) — útil para bootstrapear un admin "de las
// sombras" sin pasar por el flujo de crear-luego-editar en la UI.
const hidden = flags.includes("--hidden");

function toBase64Url(bytes) {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return Buffer.from(binary, "binary")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function hashPassword(plain) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(plain),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
		keyMaterial,
		256,
	);
	return `${toBase64Url(salt)}:${toBase64Url(new Uint8Array(bits))}`;
}

const id = crypto.randomUUID();
const passwordHash = await hashPassword(password);
const escapedName = fullName.replace(/'/g, "''");

const sql = `INSERT INTO users (id, full_name, username, gender, theocratic_status, system_role, is_hidden_admin, account_status, password_hash, password_algo) VALUES ('${id}', '${escapedName}', '${username}', 'male', 'baptized_publisher', 'admin', ${hidden ? 1 : 0}, 'active', '${passwordHash}', 'PBKDF2-SHA256');`;

const target = remote ? "--remote" : "--local";
execSync(`npx wrangler d1 execute DB ${target} --command "${sql.replace(/"/g, '\\"')}"`, { stdio: "inherit" });

console.log(`\nAdmin creado (${target}${hidden ? ", oculto" : ""}): usuario="${username}" contraseña="${password}"`);
