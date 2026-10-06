-- El módulo de cuentas del Salón del Reino (S-26/S-44/S-45) se elimina: ya
-- existe un módulo oficial para esto en jw.org, no tiene sentido duplicarlo.
DELETE FROM appointment_privilege_rules WHERE privilege_id = 'priv_maintenance_accounts';
DELETE FROM user_privileges WHERE privilege_id = 'priv_maintenance_accounts';
DELETE FROM privileges WHERE id = 'priv_maintenance_accounts';

DROP TABLE IF EXISTS maintenance_transactions;
DROP TABLE IF EXISTS maintenance_monthly_reports;
DROP TABLE IF EXISTS maintenance_audits;
DROP TABLE IF EXISTS maintenance_authorized_payers;
