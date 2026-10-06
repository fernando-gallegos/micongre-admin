import { and, eq } from "drizzle-orm";
import { users } from "@/db/schema";

// Sumar esta condición a cualquier query de `users` que sea congregation-facing
// (listados, grupos, estadísticas, selectores) — nunca a las de auth/sesión,
// que no dependen del registro de publicador del admin.
// Excluye al administrador oculto y a los publicadores "Sacados": ninguno cuenta
// como parte de la congregación (conteos, grupos, hogares, asignaciones, avisos).
// El listado de Publicadores usa solo `notHiddenAdminOnly` para poder gestionar a los sacados.
export const notHiddenAdminOnly = eq(users.isHiddenAdmin, false);
export const notHiddenAdmin = and(eq(users.isHiddenAdmin, false), eq(users.disfellowshipped, false));
