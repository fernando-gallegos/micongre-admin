# Micongre — Administración de congregación

Plataforma web (Fase 1) para la administración de una congregación de
Testigos de Jehová: publicadores, nombramientos, privilegios, planificación de
reuniones, tareas operativas, informes de servicio y asistencia — ciñéndose a
"Pastoreen el rebaño de Dios", "Organizados para hacer la voluntad de Jehová"
y las instrucciones S-38.

Construida con Next.js (App Router) + TypeScript + Tailwind, desplegada en
Cloudflare Workers vía [OpenNext](https://opennext.js.org/cloudflare), con
Cloudflare D1 (SQLite) + [Drizzle ORM](https://orm.drizzle.team/) como base de
datos, pensada para correr dentro del free tier de Cloudflare.

Una Fase 2 futura (app Android, fuera de este repo) reutilizará la misma API
de autenticación — ver [docs/mobile-activation-protocol.md](docs/mobile-activation-protocol.md).

## Desplegar tu propia copia en Cloudflare (paso a paso)

Cada congregación despliega su propia instancia en **su propia cuenta de
Cloudflare** (el free tier alcanza). No necesitas saber programar; solo seguir
estos pasos.

### 1. Requisitos

- Una cuenta de [GitHub](https://github.com/signup) y una de [Cloudflare](https://dash.cloudflare.com/sign-up) (gratis).
- [Node.js](https://nodejs.org/) 20 o superior instalado.

### 2. Obtén el código

Haz clic en **Fork** en la parte superior de este repositorio y luego clona tu fork:

```bash
git clone https://github.com/TU-USUARIO/micongre-web.git
cd micongre-web
npm install
```

### 3. Inicia sesión en Cloudflare

```bash
npx wrangler login
```

Se abrirá el navegador; autoriza el acceso.

### 4. Crea tu base de datos y aplica las migraciones

```bash
npm run setup -- nombre-de-tu-congregacion
```

Usa solo minúsculas, números y guiones (ej. `sanjose-centro`). Este comando crea
la base de datos D1 en tu cuenta, escribe su ID en `wrangler.json`, y aplica
todas las migraciones. Ese será también el nombre de tu Worker.

### 5. Despliega

```bash
npm run deploy
```

Al terminar verás una URL del tipo `https://nombre-de-tu-congregacion.TU-CUENTA.workers.dev`.

### 6. Configura el secreto de sesiones

```bash
npm run setup:secrets
```

Genera y sube un `JWT_SECRET` aleatorio a tu Worker. Solo se hace una vez.

### 7. Abre la app

Entra a la URL de tu Worker: verás el **asistente de configuración inicial**
(importar desde Hourglass, restaurar un respaldo o empezar vacío, y crear el
administrador).

### 8. (Opcional) Subdominio `tucongregacion.micongre.app`

Si quieres una dirección propia bajo `micongre.app`, envía un correo a
**galhersoft+micongre@gmail.com** con el asunto *"Solicitud de subdominio MiCongre"* e
incluye:

- Nombre de tu congregación.
- Subdominio deseado (ej. `sanjose-centro`).
- La URL `workers.dev` de tu Worker (paso 5).

El subdominio se registra manualmente en un router que redirige
`sanjose-centro.micongre.app` a tu Worker (sigue viviendo en tu cuenta, con tu
propia base de datos). Cuando esté listo te avisaremos y podrás entrar por
`https://sanjose-centro.micongre.app`. No necesitas cambiar nada en tu Worker
ni en tu DNS.

> Alternativa: puedes usar tu propio dominio agregándolo en Cloudflare →
> Workers & Pages → tu Worker → Settings → Domains & Routes.

### Actualizar tu copia

Cuando haya cambios en este repo, usa **Sync fork** en GitHub, `git pull`, y
vuelve a ejecutar `npm run deploy`. Si hay migraciones nuevas: `npm run db:migrate:remote`.

## Desarrollo local

```bash
npm install
```

1. Copia `.dev.vars.example` a `.dev.vars` y define un `JWT_SECRET` propio para desarrollo.
2. Aplica las migraciones en la base de datos D1 local:
   ```bash
   npm run db:migrate:local
   ```
3. Levanta el servidor de desarrollo (la primera vez abre el asistente de configuración en `/setup`):
   ```bash
   npm run dev
   ```

Alternativa por consola al asistente: `npm run db:create-admin -- "Tu Nombre" tu.usuario tu-contraseña`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Next.js. |
| `npm run build` | Build de producción de Next.js. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run preview` | Build con OpenNext + `wrangler dev` (emula el Worker real). |
| `npm run deploy` | Build con OpenNext + deploy a Cloudflare Workers. |
| `npm run setup` / `setup:secrets` | Prepara tu cuenta de Cloudflare (D1 + migraciones) y sube `JWT_SECRET`. |
| `npm run db:migrate:local` / `db:migrate:remote` | Aplica `migrations/*.sql` a D1 local/remoto. |
| `npm run db:create-admin` | Bootstrap del primer usuario administrador. |
| `npm run cf-typegen` | Regenera `worker-configuration.d.ts` desde `wrangler.json`. |

## Estructura

- `src/db/schema/` — esquema Drizzle (una tabla por archivo, ver `index.ts`).
- `src/lib/auth/` — hashing de contraseñas, JWT, tokens de refresh/activación, sesión.
- `src/lib/rbac/` — motor de elegibilidad teocrática y guards de autorización.
- `migrations/` — SQL de mano, aplicado con `wrangler d1 migrations apply` (numeración secuencial, no generado por drizzle-kit).
- `docs/mobile-activation-protocol.md` — contrato de activación de cuenta para la futura app Android.

## Documentación

- [docs/architecture.md](docs/architecture.md) — arquitectura completa: modelo de datos, autenticación, RBAC y cada módulo funcional.
- [CLAUDE.md](CLAUDE.md) — guía para trabajar en este repo con Claude Code.
- [docs/mobile-activation-protocol.md](docs/mobile-activation-protocol.md) — contrato de activación de cuenta para la futura app Android.
