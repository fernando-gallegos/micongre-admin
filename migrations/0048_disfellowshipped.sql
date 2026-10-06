-- Publicador "Sacado" (expulsado): se comporta como inactivo (congregation_status
-- queda en 'inactive') pero además no cuenta para nada en la congregación:
-- conteos, listas de grupos y hogares, asignaciones, avisos, informes. No se
-- toca el CHECK de congregation_status (reconstruir users arrastraría a todas
-- las tablas que la referencian); se marca con esta bandera.
ALTER TABLE users ADD COLUMN disfellowshipped INTEGER NOT NULL DEFAULT 0;
