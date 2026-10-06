// Si existe D1_DATABASE_ID (variable de build en Cloudflare), la escribe en
// wrangler.json para no tener que commitear el ID de la base de datos.
import { readFileSync, writeFileSync } from "node:fs";

const id = process.env.D1_DATABASE_ID;
if (id) {
	const path = new URL("../wrangler.json", import.meta.url);
	const config = JSON.parse(readFileSync(path, "utf8"));
	config.d1_databases[0].database_id = id;
	writeFileSync(path, JSON.stringify(config, null, "\t") + "\n");
	console.log("wrangler.json: database_id tomado de D1_DATABASE_ID.");
}
