# Notificaciones push en tiempo real (Firebase) para la app Android

Por defecto, la app Android **revisa cada cierto tiempo** (15 minutos por omisión) si hay avisos o asignaciones nuevas. Con
Firebase Cloud Messaging (FCM) los avisos llegan **al instante**. FCM es **gratuito** (plan Spark, sin tarjeta de crédito y
sin límite práctico para una congregación).

## Dos formas de tener push en tiempo real

| | **Relay de Mi Congre** (la más simple) | **Firebase propio** |
|---|---|---|
| ¿Necesita cuenta de Firebase? | **No** | Sí (gratis) |
| ¿Hay que compilar la app? | **No**: se usa la app de Mi Congre | Sí: tu propia app con tu `google-services.json` |
| ¿Qué se configura en el servidor? | `PUSH_RELAY_URL` y `PUSH_RELAY_KEY` | `FCM_SERVICE_ACCOUNT` |
| ¿Quién puede usarla? | Congregaciones **registradas** por quien administra `micongre-router` | Cualquiera |

### Relay de Mi Congre (congregaciones registradas en el router)

1. Pide a quien administra `micongre-router` que te registre (`npm run registra -- <subdominio> <tu url workers.dev>`). Te
   entregará dos valores: `PUSH_RELAY_URL` y `PUSH_RELAY_KEY` (la clave se muestra una sola vez).
2. Guárdalos como secretos de tu Worker y vuelve a desplegar:
   ```bash
   npx wrangler secret put PUSH_RELAY_URL
   npx wrangler secret put PUSH_RELAY_KEY
   ```
   o, con GitHub Actions, como secretos del repositorio `PUSH_RELAY_URL` y `PUSH_RELAY_KEY` y ejecuta **Actions → Desplegar**.
3. Aplica la migración `0053` si no lo hiciste (`npm run db:migrate:remote`).
4. Instala la app de Mi Congre, escanea el QR de tu congregación e inicia sesión: en **Mi perfil** dirá «Las notificaciones
   llegan en tiempo real (push)». Nada más: no creas Firebase ni compilas la app.

Tu servidor no habla con Firebase: le manda el aviso al relay (que ve el título y el texto al reenviarlo) y este lo envía con
la clave de Mi Congre, que nunca sale de allí. Si hay `FCM_SERVICE_ACCOUNT` propio, se usa ese en vez del relay.

## Cómo decide el sistema (automático)

| Situación | Qué se usa |
|---|---|
| El sitio **no** tiene `FCM_SERVICE_ACCOUNT` ni `PUSH_RELAY_KEY` | Web Push en el navegador + la app Android revisa cada X minutos (como hoy) |
| El sitio **sí** tiene `PUSH_RELAY_*` (y la app de Mi Congre), o `FCM_SERVICE_ACCOUNT` **y** una app compilada con `google-services.json` | **Solo push en tiempo real a Android.** Se deja de usar el push del navegador y la revisión periódica de la app |
| El sitio tiene `FCM_SERVICE_ACCOUNT` pero la app **no** trae `google-services.json` | Nada llega al teléfono por FCM: la app sigue revisando por su cuenta |

La app lo averigua sola: al iniciar sesión pregunta al sitio (`GET /api/devices/config`) si usa FCM; si es así registra el
token de su dispositivo (`POST /api/devices/register`) y deja de revisar. En **Mi perfil → Notificaciones** verás
«Las notificaciones llegan en tiempo real (push)».

> Para volver al sistema anterior basta con borrar el secreto: `npx wrangler secret delete FCM_SERVICE_ACCOUNT`.

Hay **dos piezas** de Firebase y van en lugares distintos:

| Pieza | Archivo | ¿Es secreto? | Dónde va |
|---|---|---|---|
| Configuración de la **app** Android | `google-services.json` | No es secreta (identifica la app), pero no se sube al repo | `micongre-app/app/google-services.json` |
| **Cuenta de servicio** del servidor | JSON de clave privada | **Sí, es secreta** | Secreto `FCM_SERVICE_ACCOUNT` del Worker (o secreto de GitHub) |

---

## Paso 1. Crear la cuenta y el proyecto de Firebase (gratis)

1. Entra a <https://console.firebase.google.com> con una cuenta de Google (cualquier Gmail sirve; si no tienes, créala en
   <https://accounts.google.com/signup>).
2. Pulsa **Crear un proyecto** (o «Add project»).
3. Nombre del proyecto: por ejemplo `mi-congre`. Continúa.
4. **Google Analytics**: puedes desactivarlo (no se necesita). Pulsa **Crear proyecto** y espera a que termine.
5. El proyecto queda en el plan **Spark (gratuito)**. No hay que agregar tarjeta ni cambiar de plan.

## Paso 2. Registrar la app Android y obtener `google-services.json`

1. En la página principal del proyecto pulsa el ícono de **Android** («Agregar app»).
2. **Nombre del paquete de Android:** `com.micongre.app` (debe ser exactamente ese).
3. Apodo de la app: `Mi Congre`. El certificado SHA-1 **no** es necesario para notificaciones.
4. Pulsa **Registrar app**.
5. Pulsa **Descargar google-services.json**.
6. Copia ese archivo a: `micongre-app/app/google-services.json`
   (junto a `google-services.json.example`). El proyecto Android ya está preparado: en cuanto existe ese archivo, Gradle
   aplica el plugin de Firebase automáticamente. Omite los pasos «agregar el SDK» que muestra la consola: ya está hecho.
7. Pulsa **Siguiente** hasta terminar el asistente.

> Si compilas la app desde un CI (GitHub Actions), guarda el contenido del archivo en base64 como secreto
> `GOOGLE_SERVICES_JSON` y restáuralo antes de compilar:
> `echo "$GOOGLE_SERVICES_JSON" | base64 -d > app/google-services.json`.

## Paso 3. Descargar la clave de la cuenta de servicio (para el servidor)

1. En la consola de Firebase pulsa el engranaje ⚙ → **Configuración del proyecto**.
2. Pestaña **Cuentas de servicio**.
3. Pulsa **Generar nueva clave privada** → **Generar clave**. Se descarga un archivo `.json` (por ejemplo
   `mi-congre-firebase-adminsdk-xxxxx.json`).
4. **Guárdalo en un lugar seguro y no lo subas al repositorio.** Quien lo tenga puede enviar notificaciones a tu proyecto.
5. Verifica que la API esté habilitada: pestaña **Cloud Messaging** de la misma configuración, debe decir
   «API de Firebase Cloud Messaging (V1): Habilitada». Si aparece deshabilitada, abre el menú ⋮ y pulsa **Administrar API en
   Google Cloud Console** → **Habilitar**.

## Paso 4. Poner la clave en el servidor

Hay dos formas; elige una.

### Opción A. Desde tu computadora (más simple)

```bash
# 1. Aplica la migración que crea la tabla de dispositivos (una sola vez)
npm run db:migrate:remote

# 2. Guarda la clave como secreto del Worker (pega el contenido del JSON cuando lo pida)
npx wrangler secret put FCM_SERVICE_ACCOUNT

#    o, si el archivo está a mano, sin pegar nada:
npx wrangler secret put FCM_SERVICE_ACCOUNT < mi-congre-firebase-adminsdk-xxxxx.json
```

No hace falta volver a desplegar: el secreto se aplica de inmediato.

### Opción B. Con GitHub Actions (automático en tu fork)

El repositorio incluye `.github/workflows/deploy.yml` (se ejecuta a mano desde la pestaña **Actions → Desplegar → Run
workflow**). Toma todo de los secretos del repositorio:

1. En GitHub abre tu fork → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Crea estos secretos (los obligatorios primero):

| Secreto | Obligatorio | Qué es |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Sí | Token de Cloudflare con permisos de *Workers* y *D1* (Cloudflare → Mi perfil → Tokens de API → plantilla «Edit Cloudflare Workers») |
| `CLOUDFLARE_ACCOUNT_ID` | Sí | ID de la cuenta de Cloudflare (panel de Workers, barra derecha) |
| `D1_DATABASE_ID` | Sí | ID de la base D1 (`npx wrangler d1 list`) |
| `JWT_SECRET` | Sí | Secreto largo y aleatorio para las sesiones |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY_JWK`, `VAPID_SUBJECT` | No | Web Push del navegador (`node scripts/generate-vapid-keys.mjs`). Solo se usa si **no** hay Firebase |
| **`FCM_SERVICE_ACCOUNT`** | No | **El contenido completo del JSON del Paso 3** (pega el archivo entero) |

3. Ve a **Actions → Desplegar → Run workflow**. El flujo: instala, aplica las migraciones, despliega el Worker y sube como
   secretos del Worker únicamente los que hayas definido.

## Paso 5. Probar

1. Instala la app compilada **con** `google-services.json` (ver el Paso 2) e inicia sesión.
2. En **Mi perfil → Notificaciones** debe decir «Las notificaciones llegan en tiempo real (push)».
3. Desde la web (Notificaciones → Nuevo aviso) envíate un aviso, o pulsa «Enviar» en una asignación: la notificación llega
   al instante, con la app cerrada incluso.
4. Si no llega: revisa `npx wrangler tail` (busca `fcm_send_failed`), confirma que el paquete sea `com.micongre.app`, que la
   migración `0053` esté aplicada y que el teléfono haya dado el permiso de notificaciones.

## Cómo funciona por dentro

- `src/lib/push/fcm.ts`: firma un JWT (RS256, Web Crypto) con la cuenta de servicio, lo cambia por un token de acceso y envía
  mensajes con la API HTTP v1 de FCM. Sin SDK, igual que `webPush.ts`.
- `src/lib/push/dispatch.ts`: punto único de envío (`sendPushes` / `notifyUsers`). Con `FCM_SERVICE_ACCOUNT` envía a los
  dispositivos Android (tabla `device_tokens`); sin él, por Web Push. Un token vencido se borra solo.
- `src/app/api/devices/*`: registro y baja del token del dispositivo y la consulta de configuración.
- Los recordatorios del cron (lunes y viernes) usan el mismo envío.

## Seguridad y alcance (léelo antes de compartir la clave)

- La app Android publicada es **una sola** y trae **un** proyecto de Firebase. Los tokens de los dispositivos pertenecen a ese
  proyecto, así que **el servidor de cada congregación necesita la cuenta de servicio de ese mismo proyecto**.
- Cada servidor solo conoce los tokens de **sus propios** usuarios, por lo que no puede escribirle a los dispositivos de otras
  congregaciones. Aun así, compartir una clave privada entre congregaciones independientes amplía el riesgo si alguna se filtra.
  Recomendado: en Google Cloud → IAM crea una cuenta de servicio dedicada solo con el rol **Administrador de la API de
  Firebase Cloud Messaging** (en vez de la cuenta por defecto de Firebase) y genera la clave de esa.
- Alternativas para más aislamiento: (a) cada congregación crea **su propio proyecto de Firebase** y compila su propia app con
  su `google-services.json`; o (b) un servicio central (relay) que guarde la clave y reciba los envíos de cada sitio. (b) no está
  implementado.
- Mientras `FCM_SERVICE_ACCOUNT` exista, el push del navegador (Web Push) queda desactivado en ese sitio.
