-- Acceso directo de la barra inferior (móvil): el módulo que cada persona elige
-- en Mi perfil (ruta, p. ej. '/territories'). NULL = sin acceso directo.
ALTER TABLE users ADD COLUMN nav_shortcut TEXT;
