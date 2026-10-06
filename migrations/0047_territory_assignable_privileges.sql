-- A quién se le puede encargar un territorio: privilegios que se otorgan a mano
-- (sin regla por nombramiento) desde la ficha del publicador. "Asignable para
-- territorio" aplica a los territorios de tipo General; "Asignable para
-- predicación pública" a los de predicación pública.
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_territory_assignable', 'territory_assignable', 'Asignable para territorio', 'operational', 1),
	('priv_public_preaching_assignable', 'public_preaching_assignable', 'Asignable para predicación pública', 'operational', 1);
