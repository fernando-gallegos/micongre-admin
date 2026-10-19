import path from "path";
import { defineConfig } from "vitest/config";

// Pruebas de la lógica pura (sin base de datos ni Cloudflare): npm test. Las corre también `npm run check`.
export default defineConfig({
	resolve: { alias: { "@": path.resolve(__dirname, "src") } },
	test: { include: ["src/**/*.test.ts"], environment: "node" },
});
