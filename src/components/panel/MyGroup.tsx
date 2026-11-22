"use client";

import { useState } from "react";
import { ChevronDown, MessageSquare, Phone, UserPen } from "lucide-react";
import { RequestDataDialog } from "@/components/dataRequests/RequestDataDialog";
import { Avatar, List, SectionLabel } from "@/components/ui/Layout";
import { AppointmentBadges } from "@/components/publishers/AppointmentBadges";
import { Tooltip } from "@/components/ui/Tooltip";
import { contactLinks, type ContactLinks } from "@/lib/contact/phone";
import { WhatsAppGlyph } from "./PanelLinks";

interface Member {
	id: string;
	fullName: string;
	phone?: string | null;
	activeAppointmentTypes: string[];
	/** En `people`: superintendente o auxiliar del grupo. */
	role?: "overseer" | "assistant" | null;
}

interface Group {
	name: string;
	color?: string | null;
	overseerName: string | null;
	assistantName: string | null;
	members: Member[];
	/** Todo el grupo: superintendente, auxiliar y los demás por nombre (servidores nuevos). */
	people?: Member[];
}

const CONTACT_BUTTON = "flex size-11 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90";

/** Llamar, SMS y WhatsApp (solo íconos, con su globito de ayuda). */
function ContactButtons({ name, links }: { name: string; links: ContactLinks }) {
	return (
		<div className="flex items-center gap-3 pb-3 pl-[64px] pr-4">
			<Tooltip content={`Llamar a ${name} (${links.display})`}>
				<a href={links.tel} aria-label={`Llamar a ${name}`} className={`${CONTACT_BUTTON} bg-accent`}>
					<Phone size={20} />
				</a>
			</Tooltip>
			<Tooltip content={`Enviar SMS a ${name}`}>
				<a href={links.sms} aria-label={`Enviar SMS a ${name}`} className={`${CONTACT_BUTTON} bg-[#3D5AA3]`}>
					<MessageSquare size={20} />
				</a>
			</Tooltip>
			<Tooltip content={`WhatsApp a ${name}`}>
				<a href={links.whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${name}`} className={`${CONTACT_BUTTON} bg-[#25D366]`}>
					<WhatsAppGlyph size={22} />
				</a>
			</Tooltip>
		</div>
	);
}

function MemberRow({ member, open, onToggle }: { member: Member; open: boolean; onToggle: () => void }) {
	const links = contactLinks(member.phone);
	const content = (
		<>
			<Avatar name={member.fullName} size={36} />
			<span className="min-w-0 flex-1">
				<span className="block text-sm text-ink">{member.fullName}</span>
				{member.role && (
					<span className="block text-xs font-semibold text-accent">{member.role === "overseer" ? "Superintendente" : "Auxiliar"}</span>
				)}
			</span>
			<AppointmentBadges activeAppointmentTypes={member.activeAppointmentTypes} />
		</>
	);
	// Sin número de contacto la fila no se abre.
	if (!links) return <div className="flex items-center gap-3 px-4 py-2.5">{content}</div>;
	return (
		<div>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-alt"
			>
				{content}
				<ChevronDown size={16} className={`shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
			</button>
			{open && <ContactButtons name={member.fullName} links={links} />}
		</div>
	);
}

export function MyGroup({ group, canRequestData = false }: { group: Group | null; canRequestData?: boolean }) {
	const [requestOpen, setRequestOpen] = useState(false);
	const [openMember, setOpenMember] = useState<string | null>(null);
	// Por omisión solo se ve el nombre del grupo; al tocarlo se muestran todos.
	const [expanded, setExpanded] = useState(false);

	return (
		<section>
			<SectionLabel
				right={
					canRequestData ? (
						<button type="button" onClick={() => setRequestOpen(true)} className="inline-flex items-center gap-1 font-semibold normal-case tracking-normal text-accent hover:underline">
							<UserPen size={14} /> Solicitar datos
						</button>
					) : undefined
				}
			>
				Mi grupo de servicio
			</SectionLabel>
			{canRequestData && <RequestDataDialog open={requestOpen} onClose={() => setRequestOpen(false)} />}
			{!group ? (
				<List>
					<p className="px-4 py-5 text-sm text-ink-soft">Todavía no tienes un grupo asignado.</p>
				</List>
			) : (
				<List>
					{/* El grupo en grande, de lado a lado, con su color. */}
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						aria-expanded={expanded}
						className="flex w-full items-center gap-3 px-4 py-4 text-left"
						style={group.color ? { backgroundColor: `${group.color}1f` } : undefined}
					>
						<span className="min-w-0 flex-1">
							<span className="block font-display text-2xl font-medium leading-tight" style={{ color: group.color ?? undefined }}>
								{group.name}
							</span>
							<span className="mt-0.5 block text-xs text-ink-soft">
								{(group.people ?? group.members).length} {(group.people ?? group.members).length === 1 ? "persona" : "personas"} · {expanded ? "Ocultar" : "Ver"} integrantes
							</span>
						</span>
						<ChevronDown size={20} className={`shrink-0 text-ink-soft transition-transform ${expanded ? "rotate-180" : ""}`} />
					</button>
					{/* Para contactar a cualquiera: primero el superintendente, luego el auxiliar y luego los demás por nombre. */}
					{expanded && (group.people ?? group.members).map((m) => (
						<MemberRow key={m.id} member={m} open={openMember === m.id} onToggle={() => setOpenMember((id) => (id === m.id ? null : m.id))} />
					))}
				</List>
			)}
		</section>
	);
}
