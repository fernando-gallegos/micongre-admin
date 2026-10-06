-- "Tareas operativas" (priv_operational_access) es el privilegio de acceso al
-- módulo, no una tarea operativa asignable — se movía a la misma categoría
-- 'operational' que las 9 tareas reales solo por herencia de la migración
-- 0024, lo cual lo mezclaba con ellas en cualquier UI agrupada por categoría
-- (selector de "agregar tarea" en la matriz, ficha de privilegios). Pasa a
-- 'administrative', junto con los demás privilegios de solo-acceso-a-módulo.
UPDATE privileges SET category = 'administrative' WHERE id = 'priv_operational_access';
