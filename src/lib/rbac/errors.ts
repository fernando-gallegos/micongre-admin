/** Error de autorización/elegibilidad — los Route Handlers lo atrapan y lo
 * traducen a 403 (o 400 cuando es una validación de negocio como la regla de
 * ayudante S-38). */
export class RbacError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RbacError";
	}
}
