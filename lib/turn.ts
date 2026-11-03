import type {
  AppMode,
  Narrator,
  RecentOfferRef,
  ResearchCard,
  SelectionSnapshot,
  Slip,
  UncertaintyReport,
} from "@/lib/domain";

export interface TurnLimits {
  slateEventLimit: number;
  lookupEventLimit: number;
  candidatePlayerCap: number;
}

export interface TurnInput {
  mode: AppMode;
  message: string;
  slip: Slip;
  now: string;
  recentOffers: RecentOfferRef[];
  limits: TurnLimits;
}

export interface TurnResult {
  mode: AppMode;
  fictional: boolean;
  narrative: string;
  narrator: Narrator;
  cards: ResearchCard[];
  uncertainty: UncertaintyReport | null;
  slip: Slip;
  snapshots: SelectionSnapshot[];
  clarification: string | null;
  warnings: string[];
  rejected: { action: string; reason: string }[];
  followUps: string[];
  proposalApplied: boolean;
}
