import { z } from "zod";

export const createAssessmentSchema = z.object({
	groupId: z.string().uuid(),
	reportDate: z.string().min(1),
	totalPublishersContacted: z.number().int().nonnegative().default(0),
	injuredCount: z.number().int().nonnegative().default(0),
	missingCount: z.number().int().nonnegative().default(0),
	displacedCount: z.number().int().nonnegative().default(0),
	deceasedCount: z.number().int().nonnegative().default(0),
	housesDamagedCount: z.number().int().nonnegative().default(0),
	housesDestroyedCount: z.number().int().nonnegative().default(0),
	utilitiesDisrupted: z.boolean().default(false),
	urgentNeedsFoodWater: z.boolean().default(false),
	urgentNeedsShelterClothing: z.boolean().default(false),
	notes: z.string().optional().nullable(),
	reportedToCobe: z.boolean().default(false),
	reportedToCircuitOverseer: z.boolean().default(false),
});
