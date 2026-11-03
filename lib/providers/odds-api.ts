import { z } from "zod";
import {
  marketFamily,
  playerIdFromName,
  type Offer,
  type Side,
  type SportEvent,
} from "@/lib/domain";
import { americanToDecimal } from "@/lib/payout";
import { providerCache } from "@/lib/providers/cache";
import type { OddsProvider } from "@/lib/providers/types";
import { okResult, unavailable, type DataResult } from "@/lib/result";

const ODDS_ROOT = "https://api.the-odds-api.com/v4";
const SOURCE = "the-odds-api";

const eventSchema = z
  .object({
    id: z.string(),
    commence_time: z.string(),
    home_team: z.string(),
    away_team: z.string(),
  })
  .passthrough();

const outcomeSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    price: z.number(),
    point: z.number().optional(),
  })
  .passthrough();

const eventOddsSchema = eventSchema.extend({
  bookmakers: z
    .array(
      z
        .object({
          key: z.string(),
          title: z.string(),
          markets: z.array(
            z
              .object({
                key: z.string(),
                last_update: z.string().optional(),
                outcomes: z.array(outcomeSchema),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    )
    .optional(),
});

function toEvent(row: z.infer<typeof eventSchema>): SportEvent {
  return {
    id: row.id,
    homeTeamName: row.home_team,
    awayTeamName: row.away_team,
    commenceTime: row.commence_time,
  };
}

function sideOf(name: string): Side | null {
  if (name.toLowerCase() === "over") return "over";
  if (name.toLowerCase() === "under") return "under";
  return null;
}

export function createOddsApiProvider(input: {
  apiKey: string;
  regions: string;
  preferredBookmaker: string | null;
  cacheTtlMs: number;
}): OddsProvider {
  async function getJson(path: string, params: Record<string, string>): Promise<
    | { ok: true; body: unknown }
    | { ok: false; message: string }
  > {
    const url = new URL(`${ODDS_ROOT}${path}`);
    url.searchParams.set("apiKey", input.apiKey);
    url.searchParams.set("dateFormat", "iso");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        return { ok: false, message: `The Odds API returned HTTP ${response.status}.` };
      }
      return { ok: true, body: await response.json() };
    } catch {
      return { ok: false, message: "The Odds API request failed before a response arrived." };
    }
  }

  return {
    async listEvents({ fromIso, toIso, limit }) {
      const cacheKey = `odds:events:${fromIso}:${toIso}:${limit}`;
      const cached = providerCache.get<DataResult<SportEvent[]>>(cacheKey);
      if (cached) return cached;
      const result = await getJson("/sports/basketball_nba/events", {
        commenceTimeFrom: fromIso,
        commenceTimeTo: toIso,
      });
      if (!result.ok) {
        const stale = providerCache.getStale<DataResult<SportEvent[]>>(cacheKey);
        if (stale && stale.status !== "unavailable") {
          return {
            ...stale,
            status: "stale",
            stale: true,
            message: `${result.message} Showing the last successful event list.`,
          };
        }
        return unavailable(SOURCE, result.message);
      }
      const parsed = z.array(eventSchema).safeParse(result.body);
      if (!parsed.success) return unavailable(SOURCE, "The Odds API event list did not match the expected shape.");
      const events = parsed.data
        .map(toEvent)
        .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime))
        .slice(0, limit);
      const data = okResult({
        data: events,
        fetchedAt: new Date().toISOString(),
        source: SOURCE,
        fictional: false,
        message:
          parsed.data.length > events.length
            ? `Priced the first ${events.length} events in the window to limit quota use.`
            : null,
      });
      providerCache.set(cacheKey, data, input.cacheTtlMs);
      return data;
    },

    async listOffers({ eventIds, markets, includeAlternates }) {
      const families = [...new Set(markets.map((market) => marketFamily(market)))];
      const requested = includeAlternates
        ? [...families, ...families.map((market) => `${market}_alternate`)]
        : families;
      const marketParam = requested.join(",");
      const events: SportEvent[] = [];
      const offers: Offer[] = [];
      const warnings: string[] = [];
      let stale = false;
      let newestFetch = new Date().toISOString();
      let sourceUpdatedAt: string | null = null;

      for (const eventId of eventIds) {
        const cacheKey = `odds:event:${eventId}:${marketParam}:${input.regions}`;
        const cached = providerCache.get<DataResult<{ events: SportEvent[]; offers: Offer[] }>>(cacheKey);
        let pack = cached;
        if (!pack) {
          const result = await getJson(`/sports/basketball_nba/events/${encodeURIComponent(eventId)}/odds`, {
            regions: input.regions,
            markets: marketParam,
            oddsFormat: "american",
          });
          if (!result.ok) {
            const previous = providerCache.getStale<
              DataResult<{ events: SportEvent[]; offers: Offer[] }>
            >(cacheKey);
            if (previous && previous.status !== "unavailable") {
              pack = {
                ...previous,
                status: "stale",
                stale: true,
                message: `${result.message} Showing the last successful quote for this event.`,
              };
            } else {
              warnings.push(`${result.message} Event ${eventId} was skipped.`);
              continue;
            }
          } else {
            const parsed = eventOddsSchema.safeParse(result.body);
            if (!parsed.success) {
              warnings.push(`Event ${eventId} odds did not match the expected shape and were skipped.`);
              continue;
            }
            const fetchedAt = new Date().toISOString();
            const built = offersFromEvent(parsed.data, fetchedAt);
            pack = okResult({
              data: built,
              fetchedAt,
              sourceUpdatedAt: newestUpdate(parsed.data),
              source: SOURCE,
              fictional: false,
            });
            providerCache.set(cacheKey, pack, input.cacheTtlMs);
          }
        }
        if (pack.status === "unavailable") continue;
        if (pack.stale) stale = true;
        newestFetch = pack.fetchedAt;
        sourceUpdatedAt = pack.sourceUpdatedAt ?? sourceUpdatedAt;
        events.push(...pack.data.events);
        offers.push(...pack.data.offers);
        if (pack.message) warnings.push(pack.message);
        warnings.push(...pack.warnings);
      }

      if (events.length === 0 && offers.length === 0 && warnings.length > 0) {
        return unavailable(SOURCE, warnings[0] ?? "Player props were unavailable.");
      }
      return okResult({
        data: { events, offers },
        fetchedAt: newestFetch,
        sourceUpdatedAt,
        source: SOURCE,
        fictional: false,
        stale,
        warnings,
        message: stale ? "At least one event quote is explicitly stale." : null,
      });
    },
  };
}

function newestUpdate(row: z.infer<typeof eventOddsSchema>): string | null {
  const stamps = (row.bookmakers ?? []).flatMap((book) =>
    book.markets.map((market) => market.last_update).filter((value): value is string => Boolean(value)),
  );
  return stamps.sort().at(-1) ?? null;
}

function offersFromEvent(row: z.infer<typeof eventOddsSchema>, fetchedAt: string): {
  events: SportEvent[];
  offers: Offer[];
} {
  const event = toEvent(row);
  const offers: Offer[] = [];
  for (const book of row.bookmakers ?? []) {
    for (const market of book.markets) {
      for (const outcome of market.outcomes) {
        const side = sideOf(outcome.name);
        if (!side || !outcome.description || outcome.point == null) continue;
        const decimal = americanToDecimal(outcome.price);
        if (decimal == null) continue;
        const playerName = outcome.description.trim();
        const playerId = playerIdFromName(playerName);
        offers.push({
          id: `offer:${event.id}:${book.key}:${market.key}:${playerId}:${side}:${outcome.point}`,
          eventId: event.id,
          marketKey: market.key,
          playerId,
          playerName,
          teamName: null,
          bookmakerKey: book.key,
          bookmakerTitle: book.title,
          side,
          line: outcome.point,
          oddsAmerican: outcome.price,
          oddsDecimal: decimal,
          alternate: market.key.endsWith("_alternate"),
          source: SOURCE,
          fetchedAt,
          sourceUpdatedAt: market.last_update ?? null,
          fictional: false,
        });
      }
    }
  }
  return { events: [event], offers };
}
