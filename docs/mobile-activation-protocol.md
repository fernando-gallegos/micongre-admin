# Protocolo de activación para la futura app Android

Este documento fija el contrato que la app Android de Fase 2 (fuera de alcance
de este repositorio) debe implementar para activar cuentas de publicador. La
Fase 1 (este repo) ya implementa el lado del backend; nada de esto cambia
cuando la app Android exista — es la razón de escribirlo ahora.

## Contexto

Un publicador puede existir en el sistema sin cuenta de acceso indefinidamente
(`users.account_status = 'no_account'`). Un admin decide en algún momento darle
acceso desde la ficha del publicador (`AccessPanel.tsx` → `POST
/api/publishers/[id]/access`), lo que genera un enlace de un solo uso:

```
https://<dominio>/activar/<token>
```

Ese enlace se comparte fuera de banda (WhatsApp, SMS, en persona) — **nunca
por email**, porque el login de este sistema es por usuario y contraseña, no
por correo (ver [users.username en el esquema](../src/db/schema/users.ts)).

## Hoy (Fase 1, sin app Android)

El enlace abre `app/(public)/activar/[token]/page.tsx` en el navegador, que
primero llama a `GET /api/auth/activate?token=` para precargar un formulario
con un usuario y una contraseña sugeridos (la persona puede cambiarlos antes
de confirmar) y luego a `POST /api/auth/activate` con lo que la persona
confirmó para canjear el token.

## Con la app Android (implementado)

La app Android ya implementa este contrato (`ActivationScreen`). El mismo dominio se declara como **Android App Link** verificado:

1. Publicar `/.well-known/assetlinks.json` en este dominio, declarando el
   `package_name` y el `sha256_cert_fingerprints` de la app Android firmada (con Play App Signing, la huella de la
   clave de firma de Google Play, además de la de carga). Los subdominios `*.micongre.app` y el dominio raíz lo sirve
   `micongre-router`; los sitios en `workers.dev` lo sirven desde `/.well-known/assetlinks.json` de este repo.
2. La app Android declara un `intent-filter` con `autoVerify="true"` para
   `https://<dominio>/activar/*` en su manifiesto.
3. Cuando el sistema operativo verifica la relación, tocar el enlace abre la
   app directamente en vez del navegador — **el mismo enlace, el mismo
   token**, sin ningún cambio en el backend.
4. La app extrae el `token` de la ruta (`onNewIntent` / deep link data) y
   llama al mismo endpoint que la página web.

## Contrato exacto: paso 1, `GET /api/auth/activate?token=<token>`

Solo lectura — no consume el token. Se puede llamar tantas veces como haga
falta mientras la persona decide qué usuario/contraseña usar.

**Response 200 (éxito)**

```json
{
	"fullName": "Juan Pérez",
	"suggestedUsername": "juan.perez",
	"suggestedPassword": "kX9pQ2rT",
	"usernameEditable": true
}
```

- `usernameEditable` es `false` cuando la cuenta ya tiene usuario (un
  restablecimiento de contraseña, o un acceso temporal del SC): ahí la app
  debe mostrar el usuario existente como solo lectura y dejar elegir solo la
  contraseña. Es `true` únicamente en la primera activación de una cuenta sin
  usuario todavía — ahí la persona puede aceptar la sugerencia o escribir
  otro usuario.
- `suggestedUsername` / `suggestedPassword` son solo una sugerencia para
  precargar el formulario — no quedan reservados ni persistidos hasta el
  canje del paso 2, así que pueden colisionar con lo que otra persona haya
  elegido mientras tanto (el paso 2 vuelve a validar la unicidad).

**Respuestas de error:** igual que el paso 2, abajo.

## Contrato exacto: paso 2, `POST /api/auth/activate`

**Request**

```json
{ "token": "<token opaco de la URL>", "username": "juan.perez", "password": "kX9pQ2rT" }
```

Si `usernameEditable` era `false` en el paso 1, mandar igual el `username`
que vino en `suggestedUsername` (el servidor ignora cualquier otro valor y
conserva el usuario existente de la cuenta).

**Response 200 (éxito)**

```json
{
	"username": "juan.perez",
	"password": "kX9pQ2rT",
	"accessToken": "<JWT de acceso, 15 min>",
	"refreshToken": "<token opaco>",
	"expiresIn": 900,
	"user": { "id": "...", "fullName": "Juan Pérez", "role": "regular" }
}
```

- `accessToken` / `refreshToken` dejan a la persona **ya autenticada** — la
  app debe guardarlos de inmediato (Android Keystore / EncryptedSharedPreferences)
  y no pedir un login manual después de activar.
- Mismo formato que la respuesta de `POST /api/auth/login`, así que la app
  puede reusar el mismo código que procesa un login normal.

**Respuestas de error**

| Estado | `error` | Significado |
|---|---|---|
| 400 | `invalid` | El token no existe. |
| 400 | `invalid_body` | Falta el usuario o la contraseña, o no cumplen el formato mínimo. |
| 409 | `username_taken` | El usuario elegido ya está en uso — la persona debe elegir otro (solo aplica si `usernameEditable` era `true`). |
| 410 | `used` | El token ya fue canjeado — pedir uno nuevo al admin. |
| 410 | `expired` | El token venció (14 días) — pedir uno nuevo al admin. |

## Refresh y llamadas autenticadas desde la app

Todas las rutas bajo `/api/*` (salvo `/api/auth/*`) aceptan la sesión por
cabecera `Authorization: Bearer <accessToken>` exactamente igual que por
cookie — no hay un contrato "para móvil" distinto. Cuando el access token
expira (15 min), la app llama a `POST /api/auth/refresh` con
`{ "refreshToken": "<el guardado>" }` en el cuerpo (el navegador en cambio
depende de la cookie) y recibe un par nuevo con el mismo formato.

Un refresh token reusado después de haber sido rotado (robo de token) invalida
toda la cadena de sesiones de ese usuario — la app debe manejar un 401 de
`refresh_token_reused` cerrando sesión y pidiendo activar de nuevo.

## Eliminar la cuenta: `POST /api/auth/delete-account`

Requiere sesión (cookie o `Authorization: Bearer`). Cuerpo `{ "password": "<contraseña actual>" }`.

| Estado | `error` | Significado |
|---|---|---|
| 200 | — | Cuenta eliminada: se borran usuario, contraseña, sesiones, dispositivos y suscripciones push; la persona queda "Sin cuenta" y su ficha de publicador **no** se toca. |
| 401 | `unauthorized` | Sin sesión. |
| 403 | `invalid_password` | La contraseña no es la de la cuenta. |
| 409 | `last_admin` | Es el único administrador con acceso: antes hay que dar acceso de administrador a otra persona. |

Tras un 200 la app debe quitar la cuenta de la lista local sin llamar a `/api/devices/unregister` (el servidor ya olvidó el dispositivo).
