import { connection } from "next/server";
import type { Offer } from "@/lib/domain";
import { createProviders, readLimits } from "@/lib/providers/create";

const BOARD_MARKETS = ["player_points", "player_rebounds", "player_assists", "player_threes"];

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const mode = url.searchParams.get("mode") === "demo" ? "demo" : "live";
  const providers = createProviders(mode);
  const limits = readLimits();
  const now = Date.now();
  const eventsResult = await providers.odds.listEvents({
    fromIso: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    toIso: new Date(now + 36 * 60 * 60 * 1000).toISOString(),
    limit: Math.max(limits.lookupEventLimit, 12),
  });

  if (eventsResult.status === "unavailable") {
    return Response.json({
      mode,
      events: [],
      offers: [],
      warnings: [],
      error: eventsResult.message,
    });
  }

  const warnings = [...eventsResult.warnings];
  let offers: Offer[] = [];

  if (eventId) {
    const offered = await providers.odds.listOffers({
      eventIds: [eventId],
      markets: BOARD_MARKETS,
      includeAlternates: false,
    });
    if (offered.status === "unavailable") {
      warnings.push(offered.message);
    } else {
      offers = offered.data.offers;
      warnings.push(...offered.warnings);
    }
  }

  return Response.json({
    mode,
    events: eventsResult.data,
    offers,
    warnings,
    error: null,
  });
}
