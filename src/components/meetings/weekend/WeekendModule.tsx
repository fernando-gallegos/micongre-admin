"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/Layout";
import { WeekendList } from "./WeekendList";
import { SpeakersList } from "./SpeakersList";
import { TalkOutlinesList } from "./TalkOutlinesList";
import { WeekendTabs, type WeekendTab } from "./WeekendTabs";
import { MessageTemplates } from "./MessageTemplates";

export function WeekendModule() {
	const [tab, setTab] = useState<WeekendTab>("planner");
	const tabsEl = <WeekendTabs active={tab} onChange={setTab} />;

	return (
		<div className="flex flex-col gap-4">
			{tab !== "planner" && <PageHeader title="Fin de semana" />}
			{tab !== "planner" && tabsEl}
			{/* Las tres pestañas siguen montadas (solo se ocultan): al ir y venir se conserva la semana, los filtros, el orden y los cambios sin guardar. */}
			<div hidden={tab !== "planner"} className={tab === "planner" ? "contents" : "hidden"}>
				<WeekendList tabs={tabsEl} />
			</div>
			<div hidden={tab !== "speakers"} className={tab === "speakers" ? "contents" : "hidden"}>
				<SpeakersList />
			</div>
			<div hidden={tab !== "history"} className={tab === "history" ? "contents" : "hidden"}>
				<TalkOutlinesList />
			</div>
			<div hidden={tab !== "message"} className={tab === "message" ? "contents" : "hidden"}>
				<MessageTemplates />
			</div>
		</div>
	);
}
