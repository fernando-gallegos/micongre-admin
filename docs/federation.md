# Arreglos de discursos entre congregaciones (federación)

Cada congregación corre su propio MiCongre (un fork). Para planificar discursos
públicos con otra congregación, las instancias se hablan **servidor a servidor**
por HTTPS; no hay un servidor central. La URL pública de cada instancia (la de su
subdominio en `micongre.app` o la `workers.dev`) se guarda en la otra como
`speaker_congregations.fork_url` (siempre un origen `https://host`).

Todo vive en Fin de semana › Oradores › Congregaciones.

## Estados (`talk_arrangements.status`)

| Estado     | Significado                                                                  |
| ---------- | ---------------------------------------------------------------------------- |
| `planned`  | Mes anotado, aún sin enviar                                                  |
| `pending`  | Esperando respuesta (si es `incoming`: espera la decisión de esta congregación) |
| `accepted` | Aceptado                                                                     |
| `rejected` | Rechazado                                                                    |
| `counter`  | Quien responde propuso otro mes (`proposed_year`/`proposed_month`)            |

`direction`: `outgoing` = la solicitamos nosotros; `incoming` = nos la solicitaron.
Una congregación puede tener varios arreglos, uno por mes (único por
congregación + año + mes).

## Endpoints públicos (sin sesión, `/api/federation/*`)

- `GET /api/federation/info` → `{ app: "micongre", name }`. Sirve para confirmar
  que una URL es una instancia de MiCongre y conocer el nombre de la congregación.
- `POST /api/federation/arrangements` — mensajes entre instancias. `requestId` es un
  UUID que genera quien solicita y se conserva entre reenvíos; hace de credencial.
  `senderUrl` debe coincidir con el `fork_url` registrado para esa congregación.
  - `{ status: "requested", requestId, senderUrl, year, month }` → `{ status }`
    (`pending`, o `accepted` si el mes coincide con una contrapropuesta previa).
    Si la congregación remitente no existe aquí, se crea con el nombre de su `/info`.
    Notifica (en Mi Panel y push) a quienes tengan el nombramiento de coordinador del
    cuerpo de ancianos, secretario, superintendente de servicio o coordinador de
    discursos públicos.
  - `{ status: "accepted" | "rejected", requestId, senderUrl }`
  - `{ status: "counter", requestId, senderUrl, proposedYear, proposedMonth }`
- `GET /api/federation/speakers?requestId=…` → sólo con un arreglo **aceptado**:
  `{ items: [{ fullName, outlineNumbers }] }` con los oradores locales habilitados
  (privilegio «Orador de discurso público»). Se registran en la otra instancia como
  oradores visitantes de esa congregación, enlazando los bosquejos por número.

## Flujo

1. Se registra la congregación (enlace de JW.ORG) y se guarda la URL de su MiCongre.
2. Se agrega un mes y se pulsa **Solicitar arreglo** (`requested`).
3. La otra congregación acepta, rechaza o **propone otro mes** (`counter`).
4. Ante una contrapropuesta, se acepta ese mes (se reenvía `requested` con él, que la
   otra parte acepta sola) o se cambia el mes y se vuelve a solicitar.
5. Con el arreglo `accepted`, **Obtener oradores** descarga la lista de la otra parte.

## Seguridad

- En producción `fork_url` debe ser `https` a un dominio público (no IP ni `localhost`).
- Una respuesta sólo se acepta si el `requestId` existe, la dirección es la esperada y
  `senderUrl` coincide con el fork registrado.
