"use client";

import { useCallback, useEffect, useState } from "react";

export interface AccountInfo {
	id: string;
	fullName: string;
}

interface AccountsState {
	active: AccountInfo | null;
	accounts: AccountInfo[];
}

/** Cuentas de este navegador (web multicuentas): la activa y las guardadas. `enabled` evita pedirlas hasta que se necesiten. */
export function useAccounts(enabled = true) {
	const [state, setState] = useState<AccountsState>({ active: null, accounts: [] });
	const [loaded, setLoaded] = useState(false);

	const reload = useCallback(async () => {
		try {
			const response = await fetch("/api/auth/accounts", { cache: "no-store" });
			if (response.ok) setState((await response.json()) as AccountsState);
		} finally {
			setLoaded(true);
		}
	}, []);

	useEffect(() => {
		if (enabled) void reload();
	}, [enabled, reload]);

	return { ...state, loaded, reload };
}

/** Cambia de cuenta sin pedir contraseña y recarga todo desde Mi Panel (los datos en pantalla eran de la cuenta anterior). Devuelve
 * false si la sesión guardada ya no sirve (venció): hay que volver a iniciar sesión con esa cuenta. */
export async function switchAccount(accountId: string): Promise<boolean> {
	const response = await fetch("/api/auth/switch", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ accountId }),
	});
	if (!response.ok) return false;
	window.location.assign("/panel");
	return true;
}

/** "Quitar de este dispositivo": cierra la sesión guardada de esa cuenta. */
export async function removeAccount(accountId: string): Promise<void> {
	await fetch("/api/auth/accounts/remove", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ accountId }),
	});
}
