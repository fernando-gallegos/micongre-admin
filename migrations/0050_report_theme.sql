-- Tema de los reportes descargables (Word, imagen, Excel) que elige la congregación en Congregación →
-- Tema de reportes. NULL = el predeterminado ('salvia'). Los formatos oficiales (S-12, S-21, S-89, S-140)
-- no usan tema.
ALTER TABLE congregations ADD COLUMN report_theme TEXT;
