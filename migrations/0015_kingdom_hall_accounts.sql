CREATE TABLE maintenance_authorized_payers (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	authorization_status TEXT NOT NULL DEFAULT 'active' CHECK (authorization_status IN ('active', 'inactive')),
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX maint_payer_user_idx ON maintenance_authorized_payers(user_id);

CREATE TABLE maintenance_transactions (
	id TEXT PRIMARY KEY,
	month_year TEXT NOT NULL,
	date TEXT NOT NULL,
	description TEXT NOT NULL,
	transaction_code TEXT NOT NULL CHECK (transaction_code IN ('C', 'T', 'D', 'G', 'I', 'E')),
	received_in_cents INTEGER NOT NULL DEFAULT 0,
	received_out_cents INTEGER NOT NULL DEFAULT 0,
	main_account_in_cents INTEGER NOT NULL DEFAULT 0,
	main_account_out_cents INTEGER NOT NULL DEFAULT 0,
	other_account_in_cents INTEGER NOT NULL DEFAULT 0,
	other_account_out_cents INTEGER NOT NULL DEFAULT 0,
	approved_by_initials TEXT,
	receipt_url TEXT,
	entered_by_user_id TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX maint_tx_month_idx ON maintenance_transactions(month_year);

CREATE TABLE maintenance_monthly_reports (
	id TEXT PRIMARY KEY,
	month_year TEXT NOT NULL,
	funds_start_month_cents INTEGER NOT NULL,
	total_income_cents INTEGER NOT NULL,
	total_expenses_cents INTEGER NOT NULL,
	surplus_deficit_cents INTEGER NOT NULL,
	funds_end_month_cents INTEGER NOT NULL,
	large_expenses_provision_cents INTEGER NOT NULL DEFAULT 0,
	available_funds_end_month_cents INTEGER NOT NULL,
	closed_by_user_id TEXT NOT NULL REFERENCES users(id),
	closed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX maint_report_month_idx ON maintenance_monthly_reports(month_year);

CREATE TABLE maintenance_audits (
	id TEXT PRIMARY KEY,
	quarter_name TEXT NOT NULL CHECK (quarter_name IN ('SEP_NOV', 'DEC_FEB', 'MAR_MAY', 'JUN_AUG')),
	year INTEGER NOT NULL,
	auditor_user_id TEXT NOT NULL REFERENCES users(id),
	audit_date TEXT NOT NULL,
	notes_findings TEXT,
	created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX maint_audit_quarter_idx ON maintenance_audits(quarter_name, year);

-- Privilegio administrativo para el acceso a cuentas de mantenimiento, con
-- calificación automática por nombramiento (siervo de cuentas o coordinador
-- de mantenimiento) — mismo patrón que 0005_privileges_rbac.sql.
INSERT INTO privileges (id, code, name, category, is_system_defined) VALUES
	('priv_maintenance_accounts', 'maintenance_accounts', 'Cuentas de mantenimiento del Salón del Reino (S-26/S-44)', 'administrative', 1);

INSERT INTO appointment_privilege_rules (id, privilege_id, appointment_type, requires_competency_flag) VALUES
	('rule_maint_accounts_servant', 'priv_maintenance_accounts', 'accounts_servant', 0),
	('rule_maint_coordinator', 'priv_maintenance_accounts', 'maintenance_coordinator', 0);
