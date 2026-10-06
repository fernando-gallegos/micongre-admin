-- "Administración de cuentas": generar el enlace de acceso a la app de un
-- publicador y otorgarle privilegios desde su ficha. Solo se otorga a mano
-- (no califica por nombramiento) — un admin siempre puede.
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_accounts_admin', 'accounts_admin', 'Administración de cuentas', 'administrative', 1);
