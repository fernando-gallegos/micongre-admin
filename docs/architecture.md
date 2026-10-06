# Arquitectura de Micongre

Este documento describe cómo está estructurada la aplicación completa: stack, carpetas, modelo de datos, autenticación, motor de autorización, y cada módulo funcional. Es la referencia de "cómo encaja todo" — para el contrato específico que debe implementar la futura app Android, ver [mobile-activation-protocol.md](mobile-activation-protocol.md). Para instrucciones dirigidas a Claude Code, ver [CLAUDE.md](../CLAUDE.md) en la raíz del repo.

## 1. Stack y despliegue

- **Next.js (App Router)** + TypeScript + Tailwind CSS + Lucide Icons.
- **Cloudflare Workers** como runtime de producción, vía el adaptador **OpenNext** (`@opennextjs/cloudflare`) — `next build` genera el output estándar de Next.js, y `opennextjs-cloudflare build` lo empaqueta en un Worker (`.open-next/worker.js`).
- **Cloudflare D1** (SQLite serverless) como base de datos, accedida con **Drizzle ORM** (`drizzle-orm/d1`).
- Migraciones SQL escritas a mano en `migrations/`, aplicadas con `wrangler d1 migrations apply` — **no** se usa `drizzle-kit generate` (ver nota en `CLAUDE.md`).
- El secreto `JWT_SECRET` se maneja como Wrangler secret en producción (`wrangler secret put`) y como variable en `.dev.vars` en desarrollo.
- Todo pensado para caber en el free tier de Cloudflare: consultas en 1-2 round-trips, payloads mínimos en los selectores, índices en cada columna usada en JOIN/WHERE de rutas calientes.

## 2. Estructura de carpetas

```
migrations/                 SQL de mano, numerado secuencialmente (0001-0012)
docs/                        Esta documentación + el contrato de activación móvil
scripts/create-admin.mjs     Bootstrap del primer administrador (fuera de la app web)

src/
  db/
    schema/                  Un archivo por dominio (users, appointments, privileges, midweek,
                             weekend, operational, fieldService, reports, attendance, auth,
                             households) + index.ts como barrel
    client.ts                getDb() -> instancia de Drizzle sobre el binding D1

  lib/
    auth/                    password.ts, jwt.ts, tokens.ts, encoding.ts, constants.ts,
                             cookies.ts, session.ts, username.ts, activation.ts
    rbac/                    roles.ts (constantes), eligibility.ts (motor de elegibilidad),
                             guards.ts (autorización de escritura), errors.ts
    validation/               Esquemas zod, uno por módulo
    queries/panel.ts          Consultas agregadas para el panel del usuario regular
    api/errors.ts             Traduce RbacError -> 403, cualquier otro error -> 500
    collision.ts              Detección de colisiones de tareas operativas
    s89.ts                    Generador de papeletas de notificación S-89
    appointmentLabels.ts      Etiquetas en español de los nombramientos (compartido)
    env.ts                    getEnv() -> bindings de Cloudflare (DB, JWT_SECRET)

  middleware.ts               Autenticación de rutas (cookie -> Bearer), gate básico /admin

  app/
    layout.tsx, globals.css, page.tsx (redirect según sesión)
    (public)/                 login, activar/[token] — sin sidebar, sin sesión requerida
    (app)/                    shell autenticado (Sidebar + Topbar) — panel, publishers,
                             service-groups, meetings/midweek, meetings/weekend,
                             operational, reports, reports/attendance
    api/                      Un directorio por recurso, ver sección 6 por módulo

  components/
    ui/                       Button, Input/Select, Card/Badge, Modal — primitivas Tailwind
    layout/                   Sidebar, Topbar
    auth/                     LoginForm
    shared/                   BrotherSelector (selector de elegibles, presentacional)
    publishers/, meetings/midweek/, meetings/weekend/, operational/, reports/,
    serviceGroups/, panel/    Componentes específicos de cada módulo
```

## 3. Modelo de datos

18 tablas (ver diagrama entidad-relación completo generado durante el diseño, o `src/db/schema/*.ts` para el detalle exacto de columnas):

| Tabla | Qué guarda |
|---|---|
| `households` | Unidad familiar ligera, solo para la regla de ayudante del mismo sexo/familia. |
| `users` | Publicadores: datos personales, `username`/`account_status` (login), `system_role` (admin/regular), `household_id`, `field_service_group_id` (nullable). |
| `theocratic_appointments` | Nombramientos con `start_date`/`end_date` (null = vigente) — anciano, SM, precursor, superintendentes de departamento, etc. |
| `privileges` | Catálogo de privilegios (reunión, operativo, administrativo) con sus restricciones duras (`requires_male`, `requires_baptized`, `requires_adult`). |
| `appointment_privilege_rules` | Qué nombramiento califica automáticamente para qué privilegio. |
| `user_privileges` | Concesión directa de un privilegio a un publicador (aprobación puntual del cuerpo). |
| `midweek_meetings` / `midweek_assignments` | Programa de la reunión Vida y Ministerio y sus partes. |
| `weekend_meetings` | Presidente, orador (local o visitante), Atalaya — todo en columnas de la misma fila. |
| `operational_schedules` | Tareas operativas (micrófonos, audio, video, acomodadores) — **polimórfica** (`meeting_type` + `meeting_id`, sin FK real). |
| `field_service_groups` | Grupos de predicación con superintendente/auxiliar. |
| `service_reports` | Informe mensual S-4, con `user_id` (de quién es) y `entered_by_user_id` (quién lo escribió) separados. |
| `meeting_attendance` | Asistencia S-88 — también polimórfica, igual que `operational_schedules`. |
| `refresh_tokens` | Sesiones de refresh, hasheadas, rotables. |
| `account_activation_tokens` | Tokens de activación de un solo uso. |

## 4. Autenticación

Sistema propio (sin Auth.js), diseñado para servir al mismo tiempo a la web y a la futura app Android:

- **Login por usuario y contraseña** — nunca por email. `users.username` se genera automáticamente a partir del nombre completo; el publicador nunca lo elige ni lo escribe.
- **Contraseñas**: PBKDF2-SHA256 vía Web Crypto (`crypto.subtle`), sin dependencias nativas — funciona igual en Workers que en Node.
- **JWT de acceso** (15 min) firmado HS256 a mano, con los códigos de privilegio del usuario embebidos (`privs`) para evitar una consulta extra en cada request.
- **Refresh tokens** opacos, hasheados en `refresh_tokens`, rotados en cada uso; si un token ya rotado se reintenta usar, se revoca toda la cadena de sesiones (indicio de robo).
- Cada endpoint de `/api/auth/*` fija cookies httpOnly **y** devuelve los tokens en el cuerpo JSON — la web usa las cookies, la futura app móvil usaría el JSON.
- **Activación de cuenta**: un admin genera un enlace de un solo uso desde la ficha de publicador; al abrirlo, el sistema genera usuario+contraseña automáticamente y deja al publicador con sesión iniciada. Ver `docs/mobile-activation-protocol.md` para el contrato exacto que la app Android deberá reutilizar.

`src/middleware.ts` resuelve la sesión (cookie → header `Authorization: Bearer`) para proteger páginas; `src/lib/auth/session.ts` hace lo mismo para Server Components/Actions.

## 5. RBAC y motor de elegibilidad

La pieza central es `getEligiblePublishers(db, privilegeId)` en `src/lib/rbac/eligibility.ts`: combina elegibilidad automática por nombramiento activo (`appointment_privilege_rules`) con concesión directa (`user_privileges`), aplica las restricciones duras del privilegio, y devuelve una lista mínima `{id, fullName, gender, householdId}`. **Se usa dos veces siempre**: para poblar cada selector "elegir hermano" en la UI, y para revalidar en el servidor (`assertEligibleForAssignment`) justo antes de guardar — así un cliente desactualizado o manipulado nunca puede forzar una asignación inválida.

Otras reglas de autorización en `src/lib/rbac/guards.ts`:
- `assertCanManageReport` — autoría dual de informes S-4 (el propio publicador, el superintendente/auxiliar de su grupo, o cualquier admin).
- `assertCanRecordAttendance` — admin o privilegio `meeting_attendance_recorder`.
- `isValidAssistantPairing` — regla S-38 de ayudante del mismo sexo o familiar.

`GET /api/privileges/eligible?privilegeIds=a,b,c` agrupa varias consultas de elegibilidad en un solo request, para que un constructor semanal con múltiples secciones no dispare una llamada por selector.

## 6. Módulos funcionales

### Publicadores (`/publishers`)
Nómina con búsqueda, alta, ficha con datos personales, nombramientos (alta/baja con historial), privilegios (otorgar/revocar), grupo de servicio, y el panel de generación de enlace de acceso. Tarjeta S-21 derivada (no es tabla propia) en `/publishers/[id]/s21`.

### Grupos de servicio (`/service-groups`)
Alta/edición de grupos, asignación de superintendente y auxiliar. La asignación de un publicador a un grupo se hace desde su propia ficha.

### Planificador de entre semana (`/meetings/midweek`)
Alta de reunión (siembra automáticamente las secciones fijas — Tesoros, Perlas, Lectura, Vida cristiana, Necesidades, Conductor/Lector del Estudio Bíblico), constructor semanal con selector de elegibles por sección, soporte de sala auxiliar, partes de estudiante de cantidad variable (con validación de ayudante), y generación de papeletas de notificación S-89.

### Planificador de fin de semana (`/meetings/weekend`)
Presidente, discurso público (orador local vía selector de elegibles, u orador visitante con nombre/congregación en texto libre — mutuamente excluyentes), bosquejo S-141, Conductor y Lector de La Atalaya.

### Tareas operativas (`/operational`)
Matriz por reunión (entre semana o fin de semana) de tareas dinámicas (micrófonos, audio, video, acomodadores). Detección de colisiones no bloqueante (`src/lib/collision.ts`): alguien con una parte en el programa de esa reunión, o con otra tarea operativa en la misma reunión.

### Informes y asistencia (`/reports`, `/reports/attendance`)
Tabla de recolección de informes S-4 por mes, con autoría dual — un admin ve a todos, un superintendente/auxiliar de grupo ve y completa solo los de su grupo. Registro de asistencia S-88 por reunión, gateado por privilegio dedicado (no solo por rol admin).

### Panel del usuario regular (`/panel`)
Vista personal: próximas asignaciones (combinando entre semana, fin de semana y tareas operativas en una sola lista vía `src/lib/queries/panel.ts`), historial de partes, grupo de servicio con compañeros, y autoservicio del propio informe S-4 (reutiliza el mismo formulario que usa un superintendente de grupo).

## 7. Alcance y fuera de alcance

Fuera de esta Fase 1: módulo judicial/confidencial (decisión explícita del usuario, no se modela ningún dato de comités de ancianos ni asuntos judiciales), y la app Android en sí (Fase 2) — solo se documenta el contrato que esta API ya cumple para que esa app futura pueda construirse sin renegociar nada del backend.
