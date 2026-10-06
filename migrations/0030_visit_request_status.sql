-- "pending" cubre tanto sin asignar como asignado-pero-todavía-no-atendido;
-- solo los 2 ancianos asignados pueden moverla a completed/cancelled/postponed
-- (ver api/pastoral/visit-requests/[id]/status/route.ts).
ALTER TABLE shepherding_visit_requests ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
