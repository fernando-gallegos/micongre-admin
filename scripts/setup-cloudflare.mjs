// Prepara tu cuenta de Cloudflare para desplegar este repo.
//   npm run setup -- [nombre-del-worker]   crea/reutiliza la D1, actualiza wrangler.json y migra la base remota
//   npm run setup:secrets                  (después del primer deploy) sube JWT_SECRET al Worker
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const WRANGLER_JSON = new URL("../wrangler.json", import.meta.url);

const wrangler = (args, opts = {}) =>
	execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", shell: true, stdio: ["inherit", "pipe", "inherit"], ...opts });

const readConfig = () => JSON.parse(readFileSync(WRANGLER_JSON, "utf8"));

function setupSecrets() {
	const secret = randomBytes(48).toString("base64url");
	const res = spawnSync("npx", ["wrangler", "secret", "put", "JWT_SECRET"], {
		input: secret,
		shell: true,
		stdio: ["pipe", "inherit", "inherit"],
	});
	if (res.status !== 0) {
		console.error("\nNo se pudo subir JWT_SECRET. ¿Ya ejecutaste `npm run deploy` al menos una vez?");
		process.exit(1);
	}
	console.log("\nJWT_SECRET configurado. Ya puedes abrir la URL del Worker y completar el asistente de configuración.");
}

function setupDatabase() {
	try {
		wrangler(["whoami"]);
	} catch {
		console.error("No has iniciado sesión en Cloudflare. Ejecuta `npx wrangler login` y vuelve a intentarlo.");
		process.exit(1);
	}

	const config = readConfig();
	const workerName = process.argv[2] ?? config.name;
	const dbName = `${workerName}-db`;

	const getInfo = () => {
		try {
			return JSON.parse(wrangler(["d1", "info", dbName, "--json"]));
		} catch {
			return null;
		}
	};

	let info = getInfo();
	if (info) {
		console.log(`Reutilizando la base de datos D1 existente "${dbName}".`);
	} else {
		console.log(`Creando la base de datos D1 "${dbName}"...`);
		wrangler(["d1", "create", dbName]);
		info = getInfo();
	}
	const databaseId = info?.uuid ?? info?.database_id;
	if (!databaseId) {
		console.error("No se pudo obtener el ID de la base de datos D1.");
		process.exit(1);
	}

	config.name = workerName;
	config.d1_databases[0].database_id = databaseId;
	config.d1_databases[0].database_name = dbName;
	writeFileSync(WRANGLER_JSON, JSON.stringify(config, null, "\t") + "\n");
	console.log(`wrangler.json actualizado (worker "${workerName}", D1 ${databaseId}).`);

	console.log("Aplicando migraciones en la base remota...");
	execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--remote"], { shell: true, stdio: "inherit", input: "y\n" });

	console.log("\nListo. Siguientes pasos:\n  1. npm run deploy\n  2. npm run setup:secrets");
}

if (process.argv.includes("--secrets")) setupSecrets();
else setupDatabase();
