/**
 * Corre `task` sobre cada elemento con a lo más `limit` a la vez y devuelve los resultados en el mismo orden. Para guardar varias filas
 * en paralelo (mucho más rápido que una tras otra) sin saturar al Worker ni a D1.
 */
export async function mapWithLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await task(items[i]);
		}
	});
	await Promise.all(workers);
	return results;
}
