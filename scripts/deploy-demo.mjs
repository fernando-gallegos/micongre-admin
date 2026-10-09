#!/usr/bin/env node
// Sitio de DEMOSTRACIÓN de Mi Congre ("Demo"): un Worker (micongre-demo) con su propia base D1 (micongre-demo-db), con datos
// ficticios y una cuenta de revisor. Es el que se le da a Google Play (y a quien quiera probar la app) como cuenta de prueba.
//
//   npm run demo:deploy              crea la D1 si falta, migra, despliega el Worker y vuelve a cargar los datos de Demo
//   npm run demo:deploy -- --no-seed despliega sin tocar los datos
//   npm run demo:deploy -- --seed-only  solo borra y vuelve a cargar los datos (sin desplegar)
//
// Correrlo cada vez que se actualice la app (y de vez en cuando, para que las reuniones sigan siendo de las próximas
// semanas). OJO: borra TODOS los datos de micongre-demo-db (nunca toca otra base: el nombre está fijo aquí).
// La cuenta de revisor se guarda en .demo.json (fuera de git).
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const WORKER = "micongre-demo";
const DB_NAME = "micongre-demo-db";
const DEMO_JSON = new URL("../.demo.json", import.meta.url);
const WRANGLER_JSON = new URL("../wrangler.json", import.meta.url);
const args = new Set(process.argv.slice(2));

const run = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { encoding: "utf8", shell: true, stdio: ["inherit", "pipe", "inherit"], ...opts });
const wrangler = (a, opts) => run("npx", ["wrangler", ...a], opts);

try {
	wrangler(["whoami"]);
} catch {
	console.error("No has iniciado sesión en Cloudflare: ejecuta `npx wrangler login`.");
	process.exit(1);
}

// Cuenta del revisor: se crea una vez y se conserva.
const demo = existsSync(DEMO_JSON) ? JSON.parse(readFileSync(DEMO_JSON, "utf8")) : {};
if (!demo.username) demo.username = "revisor";
if (!demo.password) demo.password = `Demo-${randomBytes(9).toString("base64url")}`;

// D1: reutiliza o crea.
const dbInfo = () => {
	try {
		return JSON.parse(wrangler(["d1", "info", DB_NAME, "--json"]));
	} catch {
		return null;
	}
};
let info = dbInfo();
if (!info) {
	console.log(`Creando la base D1 "${DB_NAME}"...`);
	wrangler(["d1", "create", DB_NAME], { stdio: "inherit" });
	info = dbInfo();
}
const databaseId = info?.uuid ?? info?.database_id;
if (!databaseId) {
	console.error("No se pudo obtener el ID de la base D1 de demostración.");
	process.exit(1);
}
demo.databaseId = databaseId;
writeFileSync(DEMO_JSON, JSON.stringify(demo, null, "\t") + "\n");

// wrangler.json apunta a la congregación real (id de relleno): se cambia solo mientras dura el despliegue y se restaura SIEMPRE.
const original = readFileSync(WRANGLER_JSON, "utf8");
const config = JSON.parse(original);
config.name = WORKER;
config.d1_databases[0].database_id = databaseId;
config.d1_databases[0].database_name = DB_NAME;
writeFileSync(WRANGLER_JSON, JSON.stringify(config, null, "\t") + "\n");

try {
	if (!args.has("--seed-only")) {
		console.log("Aplicando migraciones...");
		execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--remote"], { shell: true, stdio: ["pipe", "inherit", "inherit"], input: "y\n" });

		console.log("Desplegando el Worker de demostración...");
		const build = spawnSync("npx", ["opennextjs-cloudflare", "build"], { shell: true, stdio: "inherit" });
		if (build.status !== 0) throw new Error("falló la compilación");
		const deploy = spawnSync("npx", ["opennextjs-cloudflare", "deploy"], { shell: true, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
		process.stdout.write(deploy.stdout ?? "");
		if (deploy.status !== 0) throw new Error("falló el despliegue");
		const url = (deploy.stdout ?? "").match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0];
		if (url) demo.url = url;

		// JWT_SECRET: solo la primera vez (si se cambia, se cierran todas las sesiones).
		const secrets = wrangler(["secret", "list"]);
		if (!secrets.includes("JWT_SECRET")) {
			console.log("Configurando JWT_SECRET...");
			spawnSync("npx", ["wrangler", "secret", "put", "JWT_SECRET"], { shell: true, input: randomBytes(48).toString("base64url"), stdio: ["pipe", "inherit", "inherit"] });
		}
		writeFileSync(DEMO_JSON, JSON.stringify(demo, null, "\t") + "\n");
	}

	if (!args.has("--no-seed")) {
		if (config.d1_databases[0].database_name !== DB_NAME) throw new Error("la base no es la de demostración");
		console.log("Borrando los datos de Demo y creando la cuenta del revisor...");
		wrangler(["d1", "execute", "DB", "--remote", "--file=./scripts/wipe-all-data.sql", "--yes"], { stdio: "inherit" });
		run("node", ["scripts/create-admin.mjs", `"Revisor Demo"`, demo.username, demo.password, "--remote"], { stdio: "inherit" });

		const base = demo.url ?? process.env.DEMO_URL;
		if (!base) throw new Error("no se conoce la URL del Worker: pasa DEMO_URL=https://... o despliega primero");
		console.log("Cargando datos ficticios...");
		await new Promise((r) => setTimeout(r, 2000));
		run("node", ["scripts/seed-demo.mjs", base, demo.username, demo.password], { stdio: "inherit" });
	}
} finally {
	writeFileSync(WRANGLER_JSON, original);
}

console.log(`\nListo. Demo: ${demo.url ?? "(URL en .demo.json)"}\n  Usuario:    ${demo.username}\n  Contraseña: ${demo.password}`);
