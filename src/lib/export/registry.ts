import type { Database } from "@/db/client";
import type { Session } from "@/lib/auth/session";
import type { ReportDoc } from "./types";
import { buildGroups } from "./builders/groups";
import { buildInformes } from "./builders/informes";
import { buildMeetings } from "./builders/meetings";
import { buildOperational } from "./builders/operational";
import { buildOutgoing } from "./builders/outgoing";
import { buildPeople } from "./builders/people";
import { buildPrograms } from "./builders/programs";
import { buildS21 } from "./builders/s21";
import { buildTerritories } from "./builders/territories";

export interface BuilderContext {
	db: Database;
	session: Session;
	params: URLSearchParams;
}

/** Cada builder valida el acceso del usuario al módulo (lanza RbacError) y arma el ReportDoc. */
export type ReportBuilder = (ctx: BuilderContext) => Promise<ReportDoc>;

// kind (último tramo de /api/export/[kind]) → builder.
export const REPORT_BUILDERS: Record<string, ReportBuilder> = {
	midweek: buildMeetings,
	weekend: buildMeetings,
	"meetings-week": buildMeetings,
	operational: buildOperational,
	// Formatos oficiales: S-140 (entre semana), programa de fin de semana y papeletas S-89.
	s140: buildPrograms,
	"weekend-program": buildPrograms,
	"outgoing-talks": buildOutgoing,
	s89: buildPrograms,
	"reports-month": buildInformes,
	s21: buildS21,
	publishers: buildPeople,
	groups: buildGroups,
	households: buildGroups,
	"territory-assignment": buildTerritories,
	"territories-cards": buildTerritories,
};
