export type AppMode = "demo" | "live";
export type Side = "over" | "under";
export type OddsFormat = "american" | "decimal";
export type SettlementStatus =
  | "pending"
  | "won"
  | "lost"
  | "pushed"
  | "void"
  | "ungraded";
export type AvailabilityStatus =
  | "available"
  | "questionable"
  | "doubtful"
  | "out"
  | "unknown"
  | "not_listed";
export type AvailabilityState = "present" | "not_listed" | "unavailable";
export type Narrator = "template" | "language-model";

export const BASELINE_MODEL_VERSION = "baseline-heuristic-1";

export const BASELINE_WEIGHTS = {
  shrunkHitRate: 0.55,
  minutes: 0.2,
  availability: 0.15,
  sample: 0.1,
} as const;

export const PRIOR_HITS = 2;
export const PRIOR_GAMES = 4;
export const MIN_DECISIVE_GAMES = 5;
export const MIN_AVERAGE_MINUTES = 20;
export const MESSAGE_CHAR_LIMIT = 2000;
export const HISTORY_TURN_LIMIT = 8;
export const MAX_SLIP_SELECTIONS = 12;
export const MAX_STORED_MESSAGES = 40;
export const DEFAULT_STAKE = 10;
export const STORAGE_KEY = "baseline.v1";
export const DEMO_SOURCE = "fictional-demo-fixture";
export const DEMO_FETCHED_AT = "2026-11-02T23:00:00.000Z";
export const DEMO_SOURCE_UPDATED_AT = "2026-11-02T22:40:00.000Z";

export const SUPPORTED_MARKETS = [
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "player_blocks",
  "player_steals",
  "player_blocks_steals",
  "player_turnovers",
  "player_points_rebounds_assists",
  "player_points_rebounds",
  "player_points_assists",
  "player_rebounds_assists",
] as const;

export type MarketKey = (typeof SUPPORTED_MARKETS)[number];

export const SUGGEST_MARKETS: MarketKey[] = [
  "player_points",
  "player_rebounds",
  "player_assists",
];

export const MARKET_LABELS: Record<string, string> = {
  player_points: "Points",
  player_rebounds: "Rebounds",
  player_assists: "Assists",
  player_threes: "Threes",
  player_blocks: "Blocks",
  player_steals: "Steals",
  player_blocks_steals: "Blocks + steals",
  player_turnovers: "Turnovers",
  player_points_rebounds_assists: "Points + rebounds + assists",
  player_points_rebounds: "Points + rebounds",
  player_points_assists: "Points + assists",
  player_rebounds_assists: "Rebounds + assists",
};

export type StatKey =
  | "pts"
  | "reb"
  | "ast"
  | "fg3m"
  | "stl"
  | "blk"
  | "turnover";

export const FAMILY_STATS: Record<string, StatKey[]> = {
  player_points: ["pts"],
  player_rebounds: ["reb"],
  player_assists: ["ast"],
  player_threes: ["fg3m"],
  player_blocks: ["blk"],
  player_steals: ["stl"],
  player_blocks_steals: ["blk", "stl"],
  player_turnovers: ["turnover"],
  player_points_rebounds_assists: ["pts", "reb", "ast"],
  player_points_rebounds: ["pts", "reb"],
  player_points_assists: ["pts", "ast"],
  player_rebounds_assists: ["reb", "ast"],
};

export interface SportEvent {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  commenceTime: string;
}

export interface GameLog {
  gameId: string;
  date: string;
  opponentName: string;
  minutes: number | null;
  stats: Partial<Record<StatKey, number>>;
}

export interface AvailabilityNote {
  playerId: string;
  status: AvailabilityStatus;
  detail: string | null;
  source: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  fictional: boolean;
}

export interface SourceStamp {
  source: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  stale: boolean;
  fictional: boolean;
}

export interface Offer {
  id: string;
  eventId: string;
  marketKey: string;
  playerId: string;
  playerName: string;
  teamName: string | null;
  bookmakerKey: string;
  bookmakerTitle: string;
  side: Side;
  line: number;
  oddsAmerican: number;
  oddsDecimal: number;
  alternate: boolean;
  source: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  fictional: boolean;
}

export interface HitRate {
  statLabel: string;
  side: Side;
  line: number;
  hits: number;
  misses: number;
  pushes: number;
  decisive: number;
  sampleSize: number;
  historicalRate: number | null;
}

export interface MinutesSummary {
  average: number | null;
  sampleSize: number;
  mostRecent: number | null;
}

export interface BaselineFactor {
  key: string;
  label: string;
  weight: number;
  value: number;
  note: string;
}

export interface BaselineScore {
  modelVersion: string;
  score: number;
  factors: BaselineFactor[];
  qualified: boolean;
  excludeReason: string | null;
}

export interface SameLinePrice {
  bookmakerKey: string;
  bookmakerTitle: string;
  line: number;
  oddsAmerican: number;
}

export interface LatestPrice {
  fetchedAt: string;
  found: boolean;
  bookmakerTitle: string | null;
  line: number | null;
  oddsAmerican: number | null;
  bestBookmakerTitle: string | null;
  bestOddsAmerican: number | null;
}

export interface RoleRead {
  summary: string;
  placement: "inside" | "outside" | "unknown";
  teammatesOut: string[];
}

export interface ResearchCard {
  offer: Offer;
  event: SportEvent;
  teamName: string | null;
  opponentName: string | null;
  logs: GameLog[];
  hitRate: HitRate;
  minutes: MinutesSummary;
  availability: AvailabilityNote | null;
  availabilityState: AvailabilityState;
  supporting: string[];
  opposing: string[];
  missing: string[];
  baseline: BaselineScore;
  limitations: string[];
  oddsSource: SourceStamp;
  statsSource: SourceStamp | null;
  availabilitySource: SourceStamp | null;
  quotedLines: AlternateLine[];
  role?: RoleRead | null;
  bestSameLine?: SameLinePrice | null;
}

export interface AlternateLine {
  offerId: string;
  marketKey: string;
  side: Side;
  line: number;
  oddsAmerican: number;
  oddsDecimal: number;
  bookmakerKey: string;
  bookmakerTitle: string;
}

export interface SlipSelection {
  id: string;
  offerId: string;
  playerId: string;
  playerName: string;
  teamName: string | null;
  opponentName: string | null;
  eventId: string;
  eventLabel: string;
  commenceTime: string;
  marketKey: string;
  marketLabel: string;
  side: Side;
  line: number;
  bookmakerKey: string;
  bookmakerTitle: string;
  oddsAmerican: number;
  oddsDecimal: number;
  snapshotId: string;
  alternates: AlternateLine[];
  logs: GameLog[];
  availability: AvailabilityNote | null;
  availabilityState: AvailabilityState;
  source: string;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  fictional: boolean;
  role?: RoleRead | null;
  bestSameLine?: SameLinePrice | null;
}

export interface Slip {
  id: string;
  name: string;
  stake: number;
  selections: SlipSelection[];
  createdAt: string;
  updatedAt: string;
  paper: true;
}

export interface EvidenceSummary {
  hitRate: HitRate;
  minutes: MinutesSummary;
  availability: AvailabilityNote | null;
  availabilityState: AvailabilityState;
  supporting: string[];
  opposing: string[];
  missing: string[];
  baseline: BaselineScore;
  limitations: string[];
  logs: GameLog[];
  oddsSource: string;
  oddsFetchedAt: string;
  oddsSourceUpdatedAt: string | null;
  fictional: boolean;
  role?: RoleRead | null;
}

export interface SelectionSnapshot {
  id: string;
  createdAt: string;
  modelVersion: string;
  slipId: string;
  replacesSnapshotId: string | null;
  playerId: string;
  playerName: string;
  opponentName: string | null;
  eventId: string;
  eventLabel: string;
  commenceTime: string;
  marketKey: string;
  marketLabel: string;
  side: Side;
  line: number;
  bookmakerTitle: string;
  oddsAmerican: number;
  oddsDecimal: number;
  offerId: string;
  stake?: number;
  evidence: EvidenceSummary;
  bestSameLine?: SameLinePrice | null;
  latestPrice?: LatestPrice | null;
  settlement: {
    status: SettlementStatus;
    method: "unset" | "manual";
    settledAt: string | null;
    note: string | null;
  };
}

export interface Intent {
  type:
    | "suggest"
    | "analyze"
    | "compare"
    | "replace"
    | "lower_line"
    | "uncertainty"
    | "set_stake"
    | "remove"
    | "add_recent"
    | "apply_proposal"
    | "list_markets"
    | "clarify";
  count: number | null;
  player: string | null;
  market: string | null;
  side: Side | null;
  line: number | null;
  otherPlayer: string | null;
  otherMarket: string | null;
  otherSide: Side | null;
  otherLine: number | null;
  index: number | null;
  stake: number | null;
  offerId: string | null;
  clarification: string | null;
}

export interface UncertaintyItem {
  title: string;
  detail: string;
}

export interface UncertaintyReport {
  biggest: UncertaintyItem | null;
  items: UncertaintyItem[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  cards: ResearchCard[];
  uncertainty: UncertaintyReport | null;
  warnings: string[];
  fictional: boolean | null;
  narrator: Narrator | null;
  followUps: string[];
}

export interface PersistedState {
  version: 1;
  slips: Slip[];
  activeSlipId: string;
  snapshots: SelectionSnapshot[];
  messages: ChatMessage[];
  oddsFormat: OddsFormat;
  mode: AppMode;
}

export interface RecentOfferRef {
  offerId: string;
  eventId: string;
  marketKey: string;
}

export function marketFamily(marketKey: string): string {
  return marketKey.endsWith("_alternate")
    ? marketKey.slice(0, -"_alternate".length)
    : marketKey;
}

export function marketLabel(marketKey: string): string {
  return MARKET_LABELS[marketFamily(marketKey)] ?? marketFamily(marketKey);
}

export function eventLabel(event: SportEvent): string {
  return `${event.awayTeamName} at ${event.homeTeamName}`;
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slug(value: string): string {
  return normalizeName(value).replace(/\s+/g, "-");
}

export function playerIdFromName(name: string): string {
  return `player:${slug(name)}`;
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatAmerican(odds: number): string {
  const rounded = Math.round(odds);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function formatDecimal(odds: number): string {
  return odds.toFixed(2);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatTipoff(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function blankIntent(type: Intent["type"]): Intent {
  return {
    type,
    count: null,
    player: null,
    market: null,
    side: null,
    line: null,
    otherPlayer: null,
    otherMarket: null,
    otherSide: null,
    otherLine: null,
    index: null,
    stake: null,
    offerId: null,
    clarification: null,
  };
}
