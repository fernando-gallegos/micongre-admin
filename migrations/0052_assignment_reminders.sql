-- Recordatorio de asignaciones (lunes: la semana; viernes: el fin de semana). reminder_hour = hora local de Nicaragua
-- (0-23); NULL = desactivado. reminder_last_run = último día (local) en que se envió, para no repetirlo.
ALTER TABLE congregations ADD COLUMN reminder_hour INTEGER;
ALTER TABLE congregations ADD COLUMN reminder_last_run TEXT;
