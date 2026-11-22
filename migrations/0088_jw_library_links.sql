-- Enlaces a JW Library: documento de la guía de actividades de cada semana (con el párrafo de cada parte numerada)
-- y del artículo de estudio de La Atalaya. Los llenan la importación de la guía y de La Atalaya y el job diario.
ALTER TABLE midweek_meetings ADD COLUMN mwb_doc_id INTEGER;
ALTER TABLE midweek_meetings ADD COLUMN mwb_pars TEXT;
ALTER TABLE weekend_meetings ADD COLUMN watchtower_doc_id INTEGER;
