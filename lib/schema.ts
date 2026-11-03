import { z } from "zod";

const sideSchema = z.enum(["over", "under"]);
const availabilityStatusSchema = z.enum([
  "available",
  "questionable",
  "doubtful",
  "out",
  "unknown",
  "not_listed",
]);

const gameLogSchema = z.object({
  gameId: z.string().min(1),
  date: z.string().min(4),
  opponentName: z.string().min(1),
  minutes: z.number().nullable(),
  stats: z.object({
    pts: z.number().optional(),
    reb: z.number().optional(),
    ast: z.number().optional(),
    fg3m: z.number().optional(),
    stl: z.number().optional(),
    blk: z.number().optional(),
    turnover: z.number().optional(),
  }),
});

const availabilitySchema = z.object({
  playerId: z.string().min(1),
  status: availabilityStatusSchema,
  detail: z.string().nullable(),
  source: z.string().min(1),
  fetchedAt: z.string().min(1),
  sourceUpdatedAt: z.string().nullable(),
  fictional: z.boolean(),
});

const sourceStampSchema = z.object({
  source: z.string(),
  fetchedAt: z.string(),
  sourceUpdatedAt: z.string().nullable(),
  stale: z.boolean(),
  fictional: z.boolean(),
});

const offerSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  marketKey: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  teamName: z.string().nullable(),
  bookmakerKey: z.string().min(1),
  bookmakerTitle: z.string().min(1),
  side: sideSchema,
  line: z.number(),
  oddsAmerican: z.number(),
  oddsDecimal: z.number(),
  alternate: z.boolean(),
  source: z.string().min(1),
  fetchedAt: z.string().min(1),
  sourceUpdatedAt: z.string().nullable(),
  fictional: z.boolean(),
});

const hitRateSchema = z.object({
  statLabel: z.string(),
  side: sideSchema,
  line: z.number(),
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  pushes: z.number().int().nonnegative(),
  decisive: z.number().int().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
  historicalRate: z.number().nullable(),
});

const baselineSchema = z.object({
  modelVersion: z.string().min(1),
  score: z.number(),
  factors: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      weight: z.number(),
      value: z.number(),
      note: z.string(),
    }),
  ),
  qualified: z.boolean(),
  excludeReason: z.string().nullable(),
});

const alternateSchema = z.object({
  offerId: z.string().min(1),
  marketKey: z.string().min(1),
  side: sideSchema,
  line: z.number(),
  oddsAmerican: z.number(),
  oddsDecimal: z.number(),
  bookmakerKey: z.string().min(1),
  bookmakerTitle: z.string().min(1),
});

const sameLinePriceSchema = z.object({
  bookmakerKey: z.string(),
  bookmakerTitle: z.string(),
  line: z.number(),
  oddsAmerican: z.number(),
});

const roleSchema = z.object({
  summary: z.string().max(900),
  placement: z.enum(["inside", "outside", "unknown"]),
  teammatesOut: z.array(z.string().max(80)).max(6),
});

const latestPriceSchema = z.object({
  fetchedAt: z.string(),
  found: z.boolean(),
  bookmakerTitle: z.string().nullable(),
  line: z.number().nullable(),
  oddsAmerican: z.number().nullable(),
  bestBookmakerTitle: z.string().nullable(),
  bestOddsAmerican: z.number().nullable(),
});

const researchCardSchema = z.object({
  offer: offerSchema,
  event: z.object({
    id: z.string(),
    homeTeamName: z.string(),
    awayTeamName: z.string(),
    commenceTime: z.string(),
  }),
  teamName: z.string().nullable(),
  opponentName: z.string().nullable(),
  logs: z.array(gameLogSchema).max(12),
  hitRate: hitRateSchema,
  minutes: z.object({
    average: z.number().nullable(),
    sampleSize: z.number().int().nonnegative(),
    mostRecent: z.number().nullable(),
  }),
  availability: availabilitySchema.nullable(),
  availabilityState: z.enum(["present", "not_listed", "unavailable"]),
  supporting: z.array(z.string()),
  opposing: z.array(z.string()),
  missing: z.array(z.string()),
  baseline: baselineSchema,
  limitations: z.array(z.string()),
  oddsSource: sourceStampSchema,
  statsSource: sourceStampSchema.nullable(),
  availabilitySource: sourceStampSchema.nullable(),
  quotedLines: z.array(alternateSchema).max(40),
  role: roleSchema.nullable().default(null),
  bestSameLine: sameLinePriceSchema.nullable().default(null),
});

const selectionSchema = z.object({
  id: z.string().min(1),
  offerId: z.string().min(1),
  playerId: z.string().min(1),
  playerName: z.string().min(1),
  teamName: z.string().nullable(),
  opponentName: z.string().nullable(),
  eventId: z.string().min(1),
  eventLabel: z.string().min(1),
  commenceTime: z.string().min(1),
  marketKey: z.string().min(1),
  marketLabel: z.string().min(1),
  side: sideSchema,
  line: z.number(),
  bookmakerKey: z.string().min(1),
  bookmakerTitle: z.string().min(1),
  oddsAmerican: z.number(),
  oddsDecimal: z.number().gt(1),
  snapshotId: z.string().min(1),
  alternates: z.array(alternateSchema).max(40),
  logs: z.array(gameLogSchema).max(12),
  availability: availabilitySchema.nullable(),
  availabilityState: z.enum(["present", "not_listed", "unavailable"]),
  source: z.string().min(1),
  fetchedAt: z.string().min(1),
  sourceUpdatedAt: z.string().nullable(),
  fictional: z.boolean(),
  role: roleSchema.nullable().default(null),
  bestSameLine: sameLinePriceSchema.nullable().default(null),
});

const slipSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  stake: z.number().min(0).max(100000),
  selections: z.array(selectionSchema).max(12),
  createdAt: z.string(),
  updatedAt: z.string(),
  paper: z.literal(true),
});

const snapshotSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  modelVersion: z.string().min(1),
  slipId: z.string().min(1),
  replacesSnapshotId: z.string().nullable(),
  playerId: z.string(),
  playerName: z.string(),
  opponentName: z.string().nullable(),
  eventId: z.string(),
  eventLabel: z.string(),
  commenceTime: z.string(),
  marketKey: z.string(),
  marketLabel: z.string(),
  side: sideSchema,
  line: z.number(),
  bookmakerTitle: z.string(),
    oddsAmerican: z.number(),
    oddsDecimal: z.number(),
    offerId: z.string(),
    stake: z.number().min(0).max(100000).default(10),
    bestSameLine: sameLinePriceSchema.nullable().default(null),
    latestPrice: latestPriceSchema.nullable().default(null),
    evidence: z.object({
    hitRate: hitRateSchema,
    minutes: z.object({
      average: z.number().nullable(),
      sampleSize: z.number(),
      mostRecent: z.number().nullable(),
    }),
    availability: availabilitySchema.nullable(),
    availabilityState: z.enum(["present", "not_listed", "unavailable"]),
    supporting: z.array(z.string()),
    opposing: z.array(z.string()),
    missing: z.array(z.string()),
    baseline: baselineSchema,
    limitations: z.array(z.string()),
    logs: z.array(gameLogSchema).max(12),
    oddsSource: z.string(),
    oddsFetchedAt: z.string(),
    oddsSourceUpdatedAt: z.string().nullable(),
    fictional: z.boolean(),
    role: roleSchema.nullable().default(null),
  }),
  settlement: z.object({
    status: z.enum(["pending", "won", "lost", "pushed", "void", "ungraded"]),
    method: z.enum(["unset", "manual"]),
    settledAt: z.string().nullable(),
    note: z.string().nullable(),
  }),
});

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
  createdAt: z.string(),
  cards: z.array(researchCardSchema).max(8),
  uncertainty: z
    .object({
      biggest: z.object({ title: z.string(), detail: z.string() }).nullable(),
      items: z.array(z.object({ title: z.string(), detail: z.string() })),
    })
    .nullable(),
  warnings: z.array(z.string()).max(20),
  fictional: z.boolean().nullable(),
  narrator: z.enum(["template", "language-model"]).nullable(),
  followUps: z.array(z.string()).max(6),
});

export const persistedSchema = z.object({
  version: z.literal(1),
  slips: z.array(slipSchema).min(1).max(20),
  activeSlipId: z.string(),
  snapshots: z.array(snapshotSchema).max(200),
  messages: z.array(messageSchema).max(40),
  oddsFormat: z.enum(["american", "decimal"]),
  mode: z.enum(["demo", "live"]),
});

export const chatRequestSchema = z.object({
  mode: z.enum(["demo", "live"]),
  message: z.string().min(1).max(2000),
  slip: slipSchema,
  recentOffers: z
    .array(
      z.object({
        offerId: z.string().min(1).max(300),
        eventId: z.string().min(1).max(160),
        marketKey: z.string().min(1).max(80),
      }),
    )
    .max(6),
});

export const intentSchema = z.object({
  type: z.enum([
    "suggest",
    "analyze",
    "compare",
    "replace",
    "lower_line",
    "uncertainty",
    "set_stake",
    "remove",
    "add_recent",
    "apply_proposal",
    "list_markets",
    "clarify",
  ]),
  count: z.number().int().min(1).max(6).nullable(),
  player: z.string().max(80).nullable(),
  market: z.string().max(80).nullable(),
  side: sideSchema.nullable(),
  line: z.number().nullable(),
  otherPlayer: z.string().max(80).nullable(),
  otherMarket: z.string().max(80).nullable(),
  otherSide: sideSchema.nullable(),
  otherLine: z.number().nullable(),
  index: z.number().int().min(1).max(12).nullable(),
  stake: z.number().min(0).max(100000).nullable(),
  offerId: z.string().max(300).nullable(),
  clarification: z.string().max(400).nullable(),
});
