import { connection } from "next/server";
import { z } from "zod";
import { createProviders } from "@/lib/providers/create";
import { allowRequest } from "@/lib/providers/cache";

const bodySchema = z.object({
  eventIds: z.array(z.string().min(1).max(160)).min(1).max(6),
});

const MARKETS = ["player_points", "player_rebounds", "player_assists", "player_threes"];

export async function POST(request: Request) {
  await connection();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(`prices:${ip}`, 12, 60_000)) {
    return Response.json(
      { offers: [], warnings: [], error: "Price checks are limited to 12 a minute on this server." },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ offers: [], warnings: [], error: "The request JSON could not be read." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ offers: [], warnings: [], error: "Send up to 6 event ids." }, { status: 400 });
  }
  const providers = createProviders("live");
  const offered = await providers.odds.listOffers({
    eventIds: parsed.data.eventIds,
    markets: MARKETS,
    includeAlternates: false,
  });
  if (offered.status === "unavailable") {
    return Response.json({ offers: [], warnings: [], fetchedAt: new Date().toISOString(), error: offered.message });
  }
  return Response.json({
    offers: offered.data.offers,
    warnings: offered.warnings,
    fetchedAt: offered.fetchedAt,
    error: null,
  });
}
