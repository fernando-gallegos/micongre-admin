import { z } from "zod";

export const createHouseholdSchema = z.object({
	label: z.string().min(1),
});

export const updateHouseholdSchema = createHouseholdSchema.partial();
