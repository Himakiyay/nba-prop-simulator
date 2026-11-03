import type { GameLog, Intent, Offer, SportEvent } from "@/lib/domain";
import type { AvailabilityNote } from "@/lib/domain";
import type { DataResult } from "@/lib/result";

export interface OddsProvider {
  listEvents(input: { fromIso: string; toIso: string; limit: number }): Promise<
    DataResult<SportEvent[]>
  >;
  listOffers(input: {
    eventIds: string[];
    markets: string[];
    includeAlternates: boolean;
  }): Promise<DataResult<{ events: SportEvent[]; offers: Offer[] }>>;
}

export interface StatsProvider {
  getLogs(input: {
    players: { id: string; name: string }[];
  }): Promise<
    DataResult<Record<string, { logs: GameLog[]; teamName: string | null }>>
  >;
}

export interface AvailabilityProvider {
  getAvailability(input: {
    players: { id: string; name: string }[];
  }): Promise<DataResult<Record<string, AvailabilityNote | null>>>;
}

export interface LanguageModel {
  configured: boolean;
  name: string;
  classify(input: {
    message: string;
    slipSummary: string;
  }): Promise<DataResult<Intent>>;
  narrate(input: { evidence: unknown; question: string }): Promise<DataResult<{ summary: string }>>;
}

export interface ProviderSet {
  odds: OddsProvider;
  stats: StatsProvider;
  availability: AvailabilityProvider;
  language: LanguageModel;
  preferredBookmaker: string | null;
}
