-- Horario de predicación de la congregación (hora por defecto de las salidas, "HH:MM"); se pide al configurar y se cambia en Congregación.
ALTER TABLE congregations ADD COLUMN preaching_time TEXT;
