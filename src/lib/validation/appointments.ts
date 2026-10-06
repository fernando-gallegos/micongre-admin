import { z } from "zod";
import { APPOINTMENT_TYPES } from "@/db/schema";

// Conjunto completo deseado de nombramientos vigentes — mismo patrón que
// setPrivilegesSchema: el servidor calcula el diff contra lo que ya está
// vigente (ver PUT /api/publishers/[id]/appointments).
export const setAppointmentsSchema = z.object({
	appointmentTypes: z.array(z.enum(APPOINTMENT_TYPES)),
});

// Conjunto completo deseado de privilegios activos — el servidor calcula el
// diff contra lo que ya está otorgado (ver PUT /api/publishers/[id]/privileges).
export const setPrivilegesSchema = z.object({
	privilegeIds: z.array(z.string().min(1)),
});
