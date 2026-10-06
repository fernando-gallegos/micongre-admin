// Digital Asset Links: con esto Android verifica que https://<sitio>/activar/<token> pertenece a la app Mi Congre y
// abre la app directamente (ver docs/mobile-activation-protocol.md). Mantener igual que micongre-router/src/site/assetlinks.ts.
export const ANDROID_PACKAGE = "com.micongre.app";

// Huellas SHA-256 de los certificados con los que se firma la app:
// - La clave de carga (micongre-release.jks): firma los APK que se instalan a mano.
// - La clave de firma de Google Play (Play Console → Integridad de la app → Firma de apps → "Certificado de la clave de
//   firma de la app"): firma lo que se instala desde Play. Agrégala aquí en cuanto exista.
export const ANDROID_CERT_SHA256 = [
	"83:03:3A:42:0B:3F:40:36:E1:68:93:7B:8B:AD:E8:F3:DD:A0:72:C0:27:D4:5E:6C:A5:1D:29:07:2A:6C:3E:A7",
];

export function assetLinks() {
	return [
		{
			relation: ["delegate_permission/common.handle_all_urls"],
			target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: ANDROID_CERT_SHA256 },
		},
	];
}
