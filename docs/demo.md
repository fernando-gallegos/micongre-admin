# Sitio de demostración (Demo)

Una congregación ficticia llamada **Demo**, con su propio Worker y su propia base D1, para darle a **Google Play** (y a cualquiera
que quiera probar la app) una cuenta de prueba que siempre funcione.

| | |
|---|---|
| URL | `https://demo.micongre.app` (registrada en `micongre-router` como `demo`) |
| Worker | `micongre-demo` |
| D1 | `micongre-demo-db` |
| Cuenta | usuario `revisor` (administrador). La contraseña está en `.demo.json` (fuera de git) |

## Contenido

16 publicadores con nombres inventados (ancianos, siervos ministeriales, precursores, estudiantes), 2 grupos de servicio, 4 reuniones
entre semana y 4 de fin de semana con todas sus partes asignadas (el revisor tiene algunas, así que Mi Panel no sale vacío), informes
de servicio de los últimos 3 meses, 3 territorios con mapa (uno asignado al revisor) y un aviso de bienvenida. Todo lo crea
`scripts/seed-demo.mjs` a través de la API pública, así que siempre respeta las reglas de elegibilidad.

## Mantenerlo al día

Cada vez que se publique una versión de la app o de la web (y cada par de semanas, porque las fechas son relativas a hoy):

```bash
npm run demo:deploy   # crea la D1 si falta, migra, despliega micongre-demo y recarga los datos
npm run demo:seed     # solo borra y vuelve a cargar los datos
```

`demo:deploy` cambia `wrangler.json` (nombre del Worker e ID de la D1) solo mientras despliega y lo restaura siempre. El nombre de la
base está fijo en el script, así que **nunca borra otra base**. El `JWT_SECRET` del Worker se genera solo la primera vez.

Sin push en tiempo real: el sitio Demo no tiene `PUSH_RELAY_*`, así que la app revisa los avisos por su cuenta.
