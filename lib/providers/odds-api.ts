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

/** The Odds API accepts YYYY-MM-DDTHH:MM:SSZ and rejects fractional seconds. */
export function oddsApiTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.replace(/\.\d+Z$/, "Z");
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

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

async function oddsErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message !== "string") return null;
    const text = body.message.replace(/\s+/g, " ").trim();
    if (!text || /apiKey|api_key/i.test(text)) return null;
    return text.slice(0, 240);
  } catch {
    return null;
  }
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
        const detail = await oddsErrorDetail(response);
        return {
          ok: false,
          message: detail
            ? `The Odds API returned HTTP ${response.status}. ${detail}`
            : `The Odds API returned HTTP ${response.status}.`,
        };
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
        commenceTimeFrom: oddsApiTimestamp(fromIso),
        commenceTimeTo: oddsApiTimestamp(toIso),
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
      let rows = parsed.data;
      let outsideWindow = false;
      if (rows.length === 0) {
        const upcoming = await getJson("/sports/basketball_nba/events", {});
        if (!upcoming.ok) return unavailable(SOURCE, upcoming.message);
        const upcomingParsed = z.array(eventSchema).safeParse(upcoming.body);
        if (!upcomingParsed.success) {
          return unavailable(SOURCE, "The Odds API event list did not match the expected shape.");
        }
        rows = upcomingParsed.data.filter((row) => row.commence_time >= oddsApiTimestamp(fromIso));
        outsideWindow = true;
      }
      const events = rows
        .map(toEvent)
        .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime))
        .slice(0, limit);
      const data = okResult({
        data: events,
        fetchedAt: new Date().toISOString(),
        source: SOURCE,
        fictional: false,
        message: outsideWindow
          ? events.length === 0
            ? "No upcoming NBA games were listed."
            : "No NBA games start in the next 36 hours. Showing the next scheduled games instead."
          : rows.length > events.length
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
      let notedRegionFallback = false;
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
            let built = offersFromEvent(parsed.data, fetchedAt);
            let sourceUpdated = newestUpdate(parsed.data);
            const configuredRegions = input.regions.split(",").map((region) => region.trim());
            if (built.offers.length === 0 && !configuredRegions.includes("us2")) {
              const fallback = await getJson(`/sports/basketball_nba/events/${encodeURIComponent(eventId)}/odds`, {
                regions: "us2",
                markets: marketParam,
                oddsFormat: "american",
              });
              if (fallback.ok) {
                const fallbackParsed = eventOddsSchema.safeParse(fallback.body);
                if (fallbackParsed.success) {
                  const fallbackBuilt = offersFromEvent(fallbackParsed.data, fetchedAt);
                  if (fallbackBuilt.offers.length > 0) {
                    built = fallbackBuilt;
                    sourceUpdated = newestUpdate(fallbackParsed.data);
                    if (!notedRegionFallback) {
                      warnings.push(
                        "No player props were listed for the configured US region. Used US2 books that had posted props.",
                      );
                      notedRegionFallback = true;
                    }
                  }
                }
              }
            }
            pack = okResult({
              data: built,
              fetchedAt,
              sourceUpdatedAt: sourceUpdated,
              source: SOURCE,
              fictional: false,
            });
            if (built.offers.length > 0) providerCache.set(cacheKey, pack, input.cacheTtlMs);
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
