-- El módulo «Tareas operativas» pasa a llamarse «Acomodadores»; su privilegio de acceso, «Administrar acomodadores».
UPDATE privileges SET name = 'Administrar acomodadores' WHERE id = 'priv_operational_access';
