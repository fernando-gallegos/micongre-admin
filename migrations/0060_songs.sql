-- Catálogo de canciones (EPUB «Cantemos con gozo», sjj) y la canción de cada discurso público de un orador:
-- al agregar un bosquejo a su repertorio se le asigna la canción que ese orador usa con él.
CREATE TABLE songs (
  number INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);

ALTER TABLE speaker_outlines ADD COLUMN song_number INTEGER;
