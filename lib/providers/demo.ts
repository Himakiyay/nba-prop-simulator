import { demoSlate, DEMO_BOOK } from "@/lib/demo/slate";
import {
  DEMO_FETCHED_AT,
  DEMO_SOURCE,
  DEMO_SOURCE_UPDATED_AT,
  marketFamily,
  type GameLog,
} from "@/lib/domain";
import { okResult, type DataResult } from "@/lib/result";
import type { ProviderSet } from "@/lib/providers/types";

const slate = demoSlate();

function demoOk<T>(data: T, message: string | null = null): DataResult<T> {
  return okResult({
    data,
    fetchedAt: DEMO_FETCHED_AT,
    sourceUpdatedAt: DEMO_SOURCE_UPDATED_AT,
    source: DEMO_SOURCE,
    fictional: true,
    message,
  });
}

export function createDemoProviders(): ProviderSet {
  return {
    preferredBookmaker: DEMO_BOOK,
    language: {
      configured: false,
      name: "demo-command-parser",
      async classify() {
        return {
          status: "unavailable",
          source: "language-model",
          message: "Demo mode uses the command parser instead of a language model.",
          fictional: false,
        };
      },
      async narrate() {
        return {
          status: "unavailable",
          source: "language-model",
          message: "Demo mode explains evidence with the template narrator.",
          fictional: false,
        };
      },
    },
    odds: {
      async listEvents({ limit }) {
        return demoOk(
          slate.events.slice(0, limit),
          "Demo slate is a fixed fictional card dated the evening of November 2, 2026 PT. It does not follow the clock.",
        );
      },
      async listOffers({ eventIds, markets, includeAlternates }) {
        const allowed = new Set(eventIds);
        const families = new Set(markets.map((market) => marketFamily(market)));
        const offers = slate.offers.filter((offer) => {
          if (!allowed.has(offer.eventId)) return false;
          const family = marketFamily(offer.marketKey);
          if (!families.has(family)) return false;
          if (offer.alternate && !includeAlternates) return false;
          return true;
        });
        const events = slate.events.filter((event) => allowed.has(event.id));
        return demoOk({ events, offers });
      },
    },
    stats: {
      async getLogs({ players }) {
        const data: Record<string, { logs: GameLog[]; teamName: string | null }> = {};
        const warnings: string[] = [];
        for (const player of players) {
          const logs = slate.logs[player.id];
          const offer = slate.offers.find((item) => item.playerId === player.id);
          if (!logs) {
            warnings.push(`No fictional logs are seeded for ${player.name}.`);
            continue;
          }
          data[player.id] = { logs, teamName: offer?.teamName ?? null };
        }
        return okResult({
          data,
          fetchedAt: DEMO_FETCHED_AT,
          sourceUpdatedAt: DEMO_SOURCE_UPDATED_AT,
          source: DEMO_SOURCE,
          fictional: true,
          warnings,
        });
      },
    },
    availability: {
      async getAvailability({ players }) {
        const data: Record<string, (typeof slate.availability)[string] | null> = {};
        const warnings: string[] = [];
        for (const player of players) {
          if (!(player.id in slate.availability)) {
            warnings.push(`No fictional availability note is seeded for ${player.name}.`);
            data[player.id] = null;
            continue;
          }
          data[player.id] = slate.availability[player.id];
        }
        return okResult({
          data,
          fetchedAt: DEMO_FETCHED_AT,
          sourceUpdatedAt: DEMO_SOURCE_UPDATED_AT,
          source: DEMO_SOURCE,
          fictional: true,
          warnings,
        });
      },
    },
  };
}
