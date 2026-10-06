import { z } from "zod";
import { TERRITORY_KINDS } from "@/db/schema";
import { MAX_FEATURES, MAX_MAP_DATA_CHARS } from "@/lib/territories/geo";

const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const geometry = z.discriminatedUnion("type", [
	z.object({ type: z.literal("Point"), coordinates: lngLat }),
	z.object({ type: z.literal("LineString"), coordinates: z.array(lngLat).min(2).max(2000) }),
	z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(lngLat).min(4).max(2000)).min(1).max(1) }),
]);

const feature = z.object({
	type: z.literal("Feature"),
	geometry,
	properties: z.object({
		fid: z.string().min(1).max(64),
		kind: z.literal("text").optional(),
		text: z.string().trim().min(1).max(200).optional(),
		emoji: z.string().trim().min(1).max(16).optional(),
	}),
});

export const mapDataSchema = z
	.object({
		type: z.literal("FeatureCollection"),
		features: z.array(feature).max(MAX_FEATURES),
	})
	.refine((d) => JSON.stringify(d).length <= MAX_MAP_DATA_CHARS, { message: "map_too_large" });

const territoryNumber = z.string().trim().min(1).max(20);
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => (v ? v : null));

export const createTerritorySchema = z.object({
	number: territoryNumber,
	kind: z.enum(TERRITORY_KINDS).default("general"),
	name: optionalText(120),
	notes: optionalText(1000),
});

export const updateTerritorySchema = z.object({
	number: territoryNumber.optional(),
	kind: z.enum(TERRITORY_KINDS).optional(),
	name: optionalText(120).optional(),
	notes: optionalText(1000).optional(),
	mapData: mapDataSchema.nullable().optional(),
});

export const assignTerritorySchema = z.object({ assigneeUserId: z.string().min(1) });

export const resolveAssignmentSchema = z.object({
	status: z.enum(["completed", "returned"]),
	comment: optionalText(500),
});

export const adminResolveSchema = resolveAssignmentSchema;
