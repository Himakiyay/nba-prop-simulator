import type { AppMode } from "@/lib/domain";
import { createBallDontLieProviders } from "@/lib/providers/balldontlie";
import { createDemoProviders } from "@/lib/providers/demo";
import { createOddsApiProvider } from "@/lib/providers/odds-api";
import { createOpenAIModel } from "@/lib/providers/openai";
import type { AvailabilityProvider, LanguageModel, OddsProvider, ProviderSet, StatsProvider } from "@/lib/providers/types";
import { unavailable } from "@/lib/result";

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

export function readLimits() {
  return {
    slateEventLimit: positiveInt("SLATE_EVENT_LIMIT", 4),
    lookupEventLimit: positiveInt("LOOKUP_EVENT_LIMIT", 8),
    candidatePlayerCap: positiveInt("CANDIDATE_PLAYER_CAP", 12),
    chatPerMinute: positiveInt("CHAT_REQUESTS_PER_MINUTE", 20),
    oddsCacheSeconds: positiveInt("ODDS_CACHE_TTL_SECONDS", 60),
    statsCacheSeconds: positiveInt("STATS_CACHE_TTL_SECONDS", 600),
  };
}

export function providerStatus() {
  return {
    defaultMode: process.env.APP_DATA_MODE === "live" ? ("live" as const) : ("demo" as const),
    odds: Boolean(process.env.THE_ODDS_API_KEY),
    stats: Boolean(process.env.BALLDONTLIE_API_KEY),
    availability: Boolean(process.env.BALLDONTLIE_API_KEY),
    languageModel: Boolean(process.env.OPENAI_API_KEY),
  };
}

const unavailableLanguage = (message: string): LanguageModel => ({
  configured: false,
  name: "unconfigured",
  async classify() {
    return unavailable("openai", message);
  },
  async narrate() {
    return unavailable("openai", message);
  },
});

export function createProviders(mode: AppMode): ProviderSet {
  if (mode === "demo") return createDemoProviders();
  const limits = readLimits();
  const oddsKey = process.env.THE_ODDS_API_KEY?.trim();
  const statsKey = process.env.BALLDONTLIE_API_KEY?.trim();
  const modelKey = process.env.OPENAI_API_KEY?.trim();
  const preferred = process.env.ODDS_BOOKMAKER_PREFERENCE?.trim() || "draftkings";
  const regions = process.env.ODDS_REGIONS?.trim() || "us";

  const odds: OddsProvider = oddsKey
    ? createOddsApiProvider({
        apiKey: oddsKey,
        regions,
        preferredBookmaker: preferred,
        cacheTtlMs: limits.oddsCacheSeconds * 1000,
      })
    : {
        async listEvents() {
          return unavailable("the-odds-api", "THE_ODDS_API_KEY is not set. Live odds are unavailable.");
        },
        async listOffers() {
          return unavailable("the-odds-api", "THE_ODDS_API_KEY is not set. Live odds are unavailable.");
        },
      };

  const missingStats =
    "BALLDONTLIE_API_KEY is not set. Live game logs are unavailable, and demo logs are not substituted.";
  const missingAvailability =
    "BALLDONTLIE_API_KEY is not set. Live availability is unavailable, and demo injury notes are not substituted.";
  const ball = statsKey
    ? createBallDontLieProviders({ apiKey: statsKey, cacheTtlMs: limits.statsCacheSeconds * 1000 })
    : null;
  const stats: StatsProvider = ball?.stats ?? {
    async getLogs() {
      return unavailable("balldontlie", missingStats);
    },
  };
  const availability: AvailabilityProvider = ball?.availability ?? {
    async getAvailability() {
      return unavailable("balldontlie", missingAvailability);
    },
  };

  return {
    odds,
    stats,
    availability,
    language: modelKey
      ? createOpenAIModel({
          apiKey: modelKey,
          model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        })
      : unavailableLanguage(
          "OPENAI_API_KEY is not set. Open-ended phrasing is limited to the command parser.",
        ),
    preferredBookmaker: preferred,
  };
}
