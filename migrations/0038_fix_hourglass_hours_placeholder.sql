-- El importador de Hourglass (scripts/import-hourglass.mjs) convertía
-- "1 minuto" — el marcador que usaba la fuente para "participó pero no
-- llevó horas" — en 0.02 horas (round(1/60*100)/100), en vez de dejarlo en
-- 0. Afecta ~328 informes de ~40 publicadores, casi todos sin nombramiento
-- de precursor (quien no lleva horas). Se corrige a 0, el valor real.
UPDATE service_reports SET hours = 0 WHERE hours = 0.02;
