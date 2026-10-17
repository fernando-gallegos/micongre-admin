-- La reunión del fin de semana normalmente abre con la canción y el discurso público; a veces se empieza con el estudio de La Atalaya
-- (p. ej. si el orador llega tarde) y el discurso va después.
ALTER TABLE weekend_meetings ADD COLUMN watchtower_first INTEGER NOT NULL DEFAULT 0;
