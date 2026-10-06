"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/Layout";
import { WeekendList } from "./WeekendList";
import { SpeakersList } from "./SpeakersList";
import { TalkOutlinesList } from "./TalkOutlinesList";
import { WeekendTabs, type WeekendTab } from "./WeekendTabs";

export function WeekendModule() {
	const [tab, setTab] = useState<WeekendTab>("planner");

	return (
		<div className="flex flex-col gap-4">
			<PageHeader title="Fin de semana" />
			<WeekendTabs active={tab} onChange={setTab} />
			{tab === "planner" && <WeekendList />}
			{tab === "speakers" && <SpeakersList />}
			{tab === "history" && <TalkOutlinesList />}
		</div>
	);
}
