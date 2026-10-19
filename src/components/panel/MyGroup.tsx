"use client";

import { useState } from "react";
import { ChevronDown, MessageSquare, Phone } from "lucide-react";
import { Avatar, List, SectionLabel } from "@/components/ui/Layout";
import { AppointmentBadges } from "@/components/publishers/AppointmentBadges";
import { GroupBadge } from "@/components/serviceGroups/GroupBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { contactLinks, type ContactLinks } from "@/lib/contact/phone";
import { WhatsAppGlyph } from "./PanelLinks";

interface Member {
	id: string;
	fullName: string;
	phone?: string | null;
	activeAppointmentTypes: string[];
}

interface Group {
	name: string;
	color?: string | null;
	overseerName: string | null;
	assistantName: string | null;
	members: Member[];
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
			<span className="min-w-0 flex-1 text-sm text-ink">{member.fullName}</span>
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

export function MyGroup({ group }: { group: Group | null }) {
	const [expanded, setExpanded] = useState(false);
	const [openMember, setOpenMember] = useState<string | null>(null);

	return (
		<section>
			<SectionLabel>Mi grupo de servicio</SectionLabel>
			{!group ? (
				<List>
					<p className="px-4 py-5 text-sm text-ink-soft">Todavía no tienes un grupo asignado.</p>
				</List>
			) : (
				<List>
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						aria-expanded={expanded}
						className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-alt"
					>
						<div className="min-w-0 flex-1">
							<GroupBadge name={group.name} color={group.color} />
							<p className="mt-2 text-[13px] text-ink-soft">
								<span className="font-medium text-ink">Superintendente:</span> {group.overseerName ?? "—"}
							</p>
							<p className="text-[13px] text-ink-soft">
								<span className="font-medium text-ink">Auxiliar:</span> {group.assistantName ?? "—"}
							</p>
						</div>
						<ChevronDown size={18} className={`shrink-0 text-ink-soft transition-transform ${expanded ? "rotate-180" : ""}`} />
					</button>
					{expanded && (
						<p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">Compañeros de grupo</p>
					)}
					{expanded &&
						group.members.map((m) => (
							<MemberRow key={m.id} member={m} open={openMember === m.id} onToggle={() => setOpenMember((id) => (id === m.id ? null : m.id))} />
						))}
				</List>
			)}
		</section>
	);
}
