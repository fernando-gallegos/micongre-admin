import { assetLinks } from "@/lib/android/assetlinks";

export const dynamic = "force-static";

export function GET() {
	return Response.json(assetLinks(), { headers: { "cache-control": "public, max-age=3600" } });
}
