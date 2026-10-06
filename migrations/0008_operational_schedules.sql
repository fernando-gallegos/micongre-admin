-- meeting_id es polimórfico (midweek_meetings.id o weekend_meetings.id según
-- meeting_type) — sin FK real; la integridad se valida en código de
-- aplicación (lib/collision.ts).
CREATE TABLE operational_schedules (
	id TEXT PRIMARY KEY,
	meeting_type TEXT NOT NULL CHECK (meeting_type IN ('midweek', 'weekend')),
	meeting_id TEXT NOT NULL,
	privilege_id TEXT NOT NULL REFERENCES privileges(id),
	assigned_user_id TEXT REFERENCES users(id),
	position TEXT
);

CREATE INDEX op_sched_meeting_idx ON operational_schedules(meeting_type, meeting_id);
CREATE INDEX op_sched_user_idx ON operational_schedules(assigned_user_id);
CREATE UNIQUE INDEX op_sched_unique_slot_idx
	ON operational_schedules(meeting_type, meeting_id, privilege_id, position);
