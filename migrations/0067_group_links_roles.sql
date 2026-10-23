-- Más botones de grupos de WhatsApp en Mi Panel (URL + color, igual que los de la congregación, nombrados y ancianos):
-- solo precursores regulares, solo siervos ministeriales y solo el comité de la congregación (coordinador, secretario y superintendente de servicio).
ALTER TABLE congregations ADD COLUMN link_pioneers_url TEXT;
ALTER TABLE congregations ADD COLUMN link_pioneers_color TEXT;
ALTER TABLE congregations ADD COLUMN link_ministerial_url TEXT;
ALTER TABLE congregations ADD COLUMN link_ministerial_color TEXT;
ALTER TABLE congregations ADD COLUMN link_committee_url TEXT;
ALTER TABLE congregations ADD COLUMN link_committee_color TEXT;
