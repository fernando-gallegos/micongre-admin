import {
	Bell,
	Building2,
	CalendarDays,
	ClipboardList,
	Compass,
	FileBadge,
	HeartHandshake,
	Home,
	House,
	MapPinned,
	Megaphone,
	Mic2,
	ShieldAlert,
	Sparkles,
	Users,
	UsersRound,
	type LucideIcon,
} from "lucide-react";
import { PRIVILEGE_CODES } from "@/lib/rbac/roles";

export interface NavItem {
	href: string;
	label: string;
	icon: LucideIcon;
	/** Visible para admin o para quien tenga alguno de estos privilegios; sin esto, para todos. */
	requiresAnyPrivilege?: string[];
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export const PANEL_ITEM: NavItem = { href: "/panel", label: "Mi panel", icon: Home };
export const NOTICES_ITEM: NavItem = { href: "/notifications", label: "Avisos", icon: Bell };
export const TERRITORIES_ITEM: NavItem = {
	href: "/territories",
	label: "Territorios",
	icon: MapPinned,
	requiresAnyPrivilege: [PRIVILEGE_CODES.TERRITORY_MANAGEMENT],
};

export const PREACHING_ITEM: NavItem = {
	href: "/preaching",
	label: "Predicación",
	icon: Megaphone,
	requiresAnyPrivilege: [PRIVILEGE_CODES.PREACHING_ADMIN],
};

// Los módulos (menú «Más» en móvil, barra lateral en escritorio), agrupados.
export const NAV_GROUPS: NavGroup[] = [
	{
		label: "Personas",
		items: [
			{
				href: "/publishers",
				label: "Publicadores",
				icon: Users,
				requiresAnyPrivilege: [PRIVILEGE_CODES.PUBLISHERS_ALL, PRIVILEGE_CODES.PUBLISHERS_GROUP],
			},
			{
				href: "/service-groups",
				label: "Grupos de servicio",
				icon: UsersRound,
				requiresAnyPrivilege: [PRIVILEGE_CODES.SERVICE_GROUPS_ACCESS],
			},
			{
				href: "/households",
				label: "Hogares",
				icon: House,
				requiresAnyPrivilege: [PRIVILEGE_CODES.HOUSEHOLDS_ALL, PRIVILEGE_CODES.HOUSEHOLDS_GROUP],
			},
		],
	},
	{
		label: "Reuniones y servicio",
		items: [
			{
				href: "/meetings/midweek",
				label: "Entre semana",
				icon: CalendarDays,
				requiresAnyPrivilege: [PRIVILEGE_CODES.MIDWEEK_ACCESS],
			},
			{
				href: "/meetings/weekend",
				label: "Fin de semana",
				icon: CalendarDays,
				requiresAnyPrivilege: [PRIVILEGE_CODES.WEEKEND_ACCESS],
			},
			{
				href: "/operational",
				label: "Tareas operativas",
				icon: Mic2,
				requiresAnyPrivilege: [PRIVILEGE_CODES.OPERATIONAL_ACCESS],
			},
			{
				href: "/cleaning",
				label: "Limpieza del salón",
				icon: Sparkles,
				requiresAnyPrivilege: [PRIVILEGE_CODES.CLEANING_ADMIN],
			},
			TERRITORIES_ITEM,
			PREACHING_ITEM,
		],
	},
	{
		label: "Administración",
		items: [
			// No exige privilegio: un superintendente/auxiliar de grupo revisa aquí los informes
			// de su grupo (S-4) y quien registra asistencia usa /reports/attendance.
			{ href: "/reports", label: "Informes", icon: ClipboardList },
			{
				href: "/congregation",
				label: "Congregación",
				icon: Building2,
				requiresAnyPrivilege: [PRIVILEGE_CODES.CONGREGATION_ACCESS],
			},
			{
				href: "/congregation/disaster",
				label: "Contingencia",
				icon: ShieldAlert,
				requiresAnyPrivilege: [PRIVILEGE_CODES.DISASTER_ACCESS],
			},
			{
				href: "/co-visit",
				label: "Visita del SC",
				icon: Compass,
				requiresAnyPrivilege: [PRIVILEGE_CODES.CO_VISIT_SCHEDULE_ACCESS],
			},
			{
				href: "/co-visit/dossier",
				label: "Paquete S-61",
				icon: FileBadge,
				requiresAnyPrivilege: [PRIVILEGE_CODES.CO_VISIT_ACCESS],
			},
			{
				href: "/pastoral",
				label: "Pastoreo",
				icon: HeartHandshake,
				requiresAnyPrivilege: [PRIVILEGE_CODES.PASTORAL_CARE_ACCESS],
			},
		],
	},
];

export function canSee(item: NavItem, role: "admin" | "regular", privilegeCodes: string[]): boolean {
	return !item.requiresAnyPrivilege || role === "admin" || item.requiresAnyPrivilege.some((c) => privilegeCodes.includes(c));
}

export function visibleGroups(role: "admin" | "regular", privilegeCodes: string[]): NavGroup[] {
	return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, role, privilegeCodes)) })).filter(
		(g) => g.items.length > 0,
	);
}

/** Ítem activo: el href más específico que coincida con la ruta actual. */
export function activeHref(pathname: string | null, hrefs: string[]): string | undefined {
	return hrefs
		.filter((href) => pathname === href || pathname?.startsWith(`${href}/`))
		.sort((a, b) => b.length - a.length)[0];
}
