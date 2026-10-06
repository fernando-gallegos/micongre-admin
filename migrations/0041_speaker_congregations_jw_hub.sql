-- Datos de la congregación obtenidos del JW Hub (hub.jw.org/meetings). Se
-- guarda el enlace pegado por el usuario (`jw_url`) para poder refrescar los
-- datos después, más los GUID de ubicación y evento que identifican a la
-- congregación en el Hub (`jw_event_id` evita duplicarla al agregarla otra vez).
-- Días: 0 = domingo ... 6 = sábado (misma convención que la API del Hub).
ALTER TABLE speaker_congregations ADD COLUMN jw_url TEXT;
ALTER TABLE speaker_congregations ADD COLUMN jw_location_id TEXT;
ALTER TABLE speaker_congregations ADD COLUMN jw_event_id TEXT;
ALTER TABLE speaker_congregations ADD COLUMN address TEXT;
ALTER TABLE speaker_congregations ADD COLUMN latitude REAL;
ALTER TABLE speaker_congregations ADD COLUMN longitude REAL;
ALTER TABLE speaker_congregations ADD COLUMN midweek_meeting_day INTEGER;
ALTER TABLE speaker_congregations ADD COLUMN midweek_meeting_time TEXT;
ALTER TABLE speaker_congregations ADD COLUMN weekend_meeting_day INTEGER;
ALTER TABLE speaker_congregations ADD COLUMN weekend_meeting_time TEXT;
ALTER TABLE speaker_congregations ADD COLUMN jw_synced_at INTEGER;

CREATE UNIQUE INDEX speaker_congregations_jw_event_idx ON speaker_congregations(jw_event_id);
