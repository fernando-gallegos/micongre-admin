export const ACCESS_COOKIE_NAME = "mc_access";
export const REFRESH_COOKIE_NAME = "mc_refresh";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export const REFRESH_TOKEN_TTL_SECONDS: Record<"web" | "mobile", number> = {
	web: 30 * 24 * 3600,
	mobile: 90 * 24 * 3600,
};

export const ACTIVATION_TOKEN_TTL_SECONDS = 14 * 24 * 3600;

// Web multicuentas: las cuentas que NO están activas en este navegador (la activa vive en mc_access / mc_refresh). Una sola cookie
// httpOnly con [{ id, name, refresh }]; el JavaScript de la página nunca la lee, solo recibe nombres desde /api/auth/accounts.
export const ACCOUNTS_COOKIE_NAME = "mc_accounts";
export const MAX_SAVED_ACCOUNTS = 5;
