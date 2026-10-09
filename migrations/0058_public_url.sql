-- Dirección pública de la app (la del router, p. ej. https://mi-congregacion.micongre.app): con ella se arman los enlaces de acceso
-- y el código QR, para no mostrar nunca la URL interna del Worker (workers.dev).
ALTER TABLE congregations ADD COLUMN public_url TEXT;
