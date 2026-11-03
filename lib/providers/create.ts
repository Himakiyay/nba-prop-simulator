import type { AppMode } from "@/lib/domain";
import { createBallDontLieProviders } from "@/lib/providers/balldontlie";
import { createEspnProviders } from "@/lib/providers/espn";
import { createDemoProviders } from "@/lib/providers/demo";
import { createOddsApiProvider } from "@/lib/providers/odds-api";
import { createOpenAIModel } from "@/lib/providers/openai";
import type { AvailabilityProvider, LanguageModel, OddsProvider, ProviderSet, StatsProvider } from "@/lib/providers/types";
import { okResult, unavailable } from "@/lib/result";

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

export function readLimits() {
  return {
    slateEventLimit: positiveInt("SLATE_EVENT_LIMIT", 8),
    lookupEventLimit: positiveInt("LOOKUP_EVENT_LIMIT", 12),
    candidatePlayerCap: positiveInt("CANDIDATE_PLAYER_CAP", 18),
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
    languageModel: Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY),
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
  const groqKey = process.env.GROQ_API_KEY?.trim();
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

  const ball = statsKey
    ? createBallDontLieProviders({ apiKey: statsKey, cacheTtlMs: limits.statsCacheSeconds * 1000 })
    : null;
  const espn = createEspnProviders({ cacheTtlMs: limits.statsCacheSeconds * 1000 });
  const stats: StatsProvider = {
    async getLogs(request) {
      if (!ball) return espn.stats.getLogs(request);
      const primary = await ball.stats.getLogs(request);
      if (primary.status === "unavailable") return espn.stats.getLogs(request);
      const blocked = primary.warnings.some((warning) => warning.includes("does not include game logs"));
      const hasLogs = Object.values(primary.data).some((row) => row.logs.length > 0);
      if (hasLogs && !blocked) return primary;
      const fallback = await espn.stats.getLogs(request);
      if (fallback.status === "unavailable") return primary;
      return okResult({
        data: fallback.data,
        fetchedAt: fallback.fetchedAt,
        sourceUpdatedAt: fallback.sourceUpdatedAt,
        source: fallback.source,
        fictional: false,
        warnings: [
          blocked
            ? "BallDontLie's free tier does not include game logs. Recent logs are from ESPN."
            : "BallDontLie returned no game logs. Recent logs are from ESPN.",
          ...fallback.warnings,
        ],
      });
    },
  };
  const availability: AvailabilityProvider = {
    async getAvailability(request) {
      if (!ball) return espn.availability.getAvailability(request);
      const primary = await ball.availability.getAvailability(request);
      if (primary.status === "unavailable") return espn.availability.getAvailability(request);
      const blocked = primary.warnings.some((warning) => warning.includes("does not include the injury list"));
      if (!blocked) return primary;
      const fallback = await espn.availability.getAvailability(request);
      if (fallback.status === "unavailable") return primary;
      return okResult({
        data: fallback.data,
        fetchedAt: fallback.fetchedAt,
        sourceUpdatedAt: fallback.sourceUpdatedAt,
        source: fallback.source,
        fictional: false,
        warnings: [
          "BallDontLie's free tier does not include the injury list. Availability is from ESPN.",
          ...fallback.warnings,
        ],
      });
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
          baseUrl: "https://api.openai.com/v1",
          name: "openai",
        })
      : groqKey
        ? createOpenAIModel({
            apiKey: groqKey,
            model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b",
            baseUrl: "https://api.groq.com/openai/v1",
            name: "groq",
          })
        : unavailableLanguage(
            "No language-model key is set. Add GROQ_API_KEY (free tier at console.groq.com) or OPENAI_API_KEY. The command parser still handles player names and slate requests.",
          ),
    preferredBookmaker: preferred,
  };
}
