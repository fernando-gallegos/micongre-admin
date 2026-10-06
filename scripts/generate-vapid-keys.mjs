// Genera un par de llaves VAPID (P-256) para Web Push y las imprime listas
// para pegar en .dev.vars / wrangler secrets. Solo usa Web Crypto — corre con
// cualquier Node reciente (18+), sin dependencias.
function toBase64Url(bytes) {
	return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey);
const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

console.log("VAPID_PUBLIC_KEY=" + toBase64Url(new Uint8Array(rawPublic)));
console.log("VAPID_PRIVATE_KEY_JWK=" + JSON.stringify(jwkPrivate));
console.log("VAPID_SUBJECT=mailto:tu-correo@ejemplo.com");
