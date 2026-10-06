-- Color configurable por grupo (hex "#rrggbb"), para pintar su nombre como
-- badge en cualquier lugar donde se muestre.
ALTER TABLE field_service_groups ADD COLUMN color TEXT;
