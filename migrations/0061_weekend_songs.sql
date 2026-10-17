-- Canciones de la reunión del fin de semana: la de La Atalaya y la final (la del discurso público sale del repertorio del orador).
ALTER TABLE weekend_meetings ADD COLUMN watchtower_song_number INTEGER;
ALTER TABLE weekend_meetings ADD COLUMN closing_song_number INTEGER;
