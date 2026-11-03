import {
  DEMO_FETCHED_AT,
  DEMO_SOURCE,
  DEMO_SOURCE_UPDATED_AT,
  playerIdFromName,
  type AvailabilityNote,
  type GameLog,
  type Offer,
  type Side,
  type SportEvent,
} from "@/lib/domain";
import { americanToDecimal } from "@/lib/payout";

export const DEMO_BOOK = "demo-book";

const events: SportEvent[] = [
  {
    id: "event:demo-lal-bos",
    awayTeamName: "Los Angeles Lakers",
    homeTeamName: "Boston Celtics",
    commenceTime: "2026-11-03T03:00:00.000Z",
  },
  {
    id: "event:demo-den-mil",
    awayTeamName: "Denver Nuggets",
    homeTeamName: "Milwaukee Bucks",
    commenceTime: "2026-11-03T03:30:00.000Z",
  },
  {
    id: "event:demo-nyk-mia",
    awayTeamName: "New York Knicks",
    homeTeamName: "Miami Heat",
    commenceTime: "2026-11-03T04:00:00.000Z",
  },
  {
    id: "event:demo-phx-dal",
    awayTeamName: "Phoenix Suns",
    homeTeamName: "Dallas Mavericks",
    commenceTime: "2026-11-03T04:30:00.000Z",
  },
];

interface PlayerSeed {
  name: string;
  teamName: string;
  eventId: string;
  availability: Pick<AvailabilityNote, "status" | "detail">;
  rows: [string, string, number, number, number, number, number][];
}

const players: PlayerSeed[] = [
  {
    name: "Jordan Hale",
    teamName: "Los Angeles Lakers",
    eventId: "event:demo-lal-bos",
    availability: { status: "available", detail: null },
    rows: [
      ["2026-10-18", "Phoenix Suns", 36, 31, 6, 4, 2],
      ["2026-10-20", "Dallas Mavericks", 34, 28, 5, 6, 3],
      ["2026-10-22", "Miami Heat", 30, 22, 7, 5, 1],
      ["2026-10-24", "Denver Nuggets", 35, 27, 4, 7, 2],
      ["2026-10-26", "Milwaukee Bucks", 38, 30, 8, 3, 4],
      ["2026-10-28", "New York Knicks", 33, 26, 6, 5, 2],
      ["2026-10-29", "Boston Celtics", 36, 33, 5, 4, 3],
      ["2026-10-31", "Chicago Bulls", 32, 25, 7, 6, 1],
      ["2026-11-01", "Golden State Warriors", 35, 29, 6, 5, 2],
      ["2026-11-02", "Sacramento Kings", 21, 19, 4, 3, 1],
    ],
  },
  {
    name: "Andre Pell",
    teamName: "Boston Celtics",
    eventId: "event:demo-lal-bos",
    availability: { status: "available", detail: null },
    rows: [
      ["2026-10-18", "Miami Heat", 34, 14, 12, 2, 1],
      ["2026-10-20", "New York Knicks", 31, 11, 8, 3, 0],
      ["2026-10-22", "Milwaukee Bucks", 33, 16, 11, 1, 2],
      ["2026-10-24", "Denver Nuggets", 29, 9, 10, 2, 1],
      ["2026-10-26", "Phoenix Suns", 32, 12, 7, 4, 0],
      ["2026-10-28", "Dallas Mavericks", 35, 18, 14, 2, 1],
      ["2026-10-29", "Los Angeles Lakers", 30, 10, 9, 3, 0],
      ["2026-10-31", "Atlanta Hawks", 33, 13, 11, 1, 2],
      ["2026-11-01", "Chicago Bulls", 28, 8, 6, 2, 0],
      ["2026-11-02", "Indiana Pacers", 34, 15, 10, 2, 1],
    ],
  },
  {
    name: "Miles Ortega",
    teamName: "Denver Nuggets",
    eventId: "event:demo-den-mil",
    availability: { status: "available", detail: null },
    rows: [
      ["2026-10-18", "Los Angeles Lakers", 36, 21, 5, 9, 2],
      ["2026-10-20", "Boston Celtics", 34, 18, 4, 8, 1],
      ["2026-10-22", "Miami Heat", 33, 16, 6, 6, 2],
      ["2026-10-24", "Dallas Mavericks", 37, 24, 3, 11, 3],
      ["2026-10-26", "Phoenix Suns", 32, 19, 5, 7, 1],
      ["2026-10-28", "New York Knicks", 35, 22, 4, 10, 2],
      ["2026-10-29", "Milwaukee Bucks", 31, 15, 7, 8, 0],
      ["2026-10-31", "Sacramento Kings", 29, 12, 4, 5, 1],
      ["2026-11-01", "Golden State Warriors", 34, 20, 5, 9, 2],
      ["2026-11-02", "Chicago Bulls", 33, 17, 6, 8, 1],
    ],
  },
  {
    name: "Chris Adelman",
    teamName: "Milwaukee Bucks",
    eventId: "event:demo-den-mil",
    availability: {
      status: "questionable",
      detail: "Ankle, listed as questionable on the fictional report.",
    },
    rows: [
      ["2026-10-19", "Boston Celtics", 32, 24, 4, 3, 2],
      ["2026-10-21", "Miami Heat", 28, 18, 5, 2, 1],
      ["2026-10-23", "New York Knicks", 30, 22, 3, 4, 2],
      ["2026-10-25", "Phoenix Suns", 34, 27, 6, 3, 3],
      ["2026-10-27", "Dallas Mavericks", 26, 15, 4, 2, 0],
      ["2026-10-29", "Denver Nuggets", 31, 23, 5, 5, 2],
      ["2026-10-31", "Chicago Bulls", 29, 20, 3, 3, 1],
      ["2026-11-02", "Indiana Pacers", 33, 26, 4, 4, 2],
    ],
  },
  {
    name: "Evan Brooks",
    teamName: "New York Knicks",
    eventId: "event:demo-nyk-mia",
    availability: { status: "available", detail: null },
    rows: [
      ["2026-10-28", "Boston Celtics", 24, 20, 3, 2, 1],
      ["2026-10-30", "Milwaukee Bucks", 27, 22, 4, 3, 2],
      ["2026-11-01", "Denver Nuggets", 22, 17, 2, 1, 0],
    ],
  },
  {
    name: "Luis Navarro",
    teamName: "Miami Heat",
    eventId: "event:demo-nyk-mia",
    availability: {
      status: "out",
      detail: "Knee, listed as out on the fictional report.",
    },
    rows: [
      ["2026-10-18", "Boston Celtics", 30, 12, 11, 1, 0],
      ["2026-10-20", "Los Angeles Lakers", 28, 9, 10, 2, 1],
      ["2026-10-22", "Denver Nuggets", 31, 14, 12, 1, 0],
      ["2026-10-24", "Dallas Mavericks", 27, 8, 9, 3, 0],
      ["2026-10-26", "Phoenix Suns", 29, 11, 8, 2, 1],
      ["2026-10-28", "Milwaukee Bucks", 32, 13, 13, 1, 0],
      ["2026-10-30", "Chicago Bulls", 26, 7, 7, 2, 0],
      ["2026-11-01", "Atlanta Hawks", 30, 10, 11, 1, 1],
    ],
  },
  {
    name: "Samir Cole",
    teamName: "Phoenix Suns",
    eventId: "event:demo-phx-dal",
    availability: { status: "available", detail: null },
    rows: [
      ["2026-10-18", "Los Angeles Lakers", 31, 18, 3, 2, 4],
      ["2026-10-20", "Boston Celtics", 29, 14, 2, 3, 2],
      ["2026-10-22", "Denver Nuggets", 33, 16, 4, 2, 3],
      ["2026-10-24", "Miami Heat", 27, 11, 3, 1, 1],
      ["2026-10-26", "Milwaukee Bucks", 34, 20, 2, 4, 5],
      ["2026-10-28", "New York Knicks", 30, 15, 4, 2, 3],
      ["2026-10-30", "Dallas Mavericks", 28, 12, 3, 3, 2],
      ["2026-11-01", "Chicago Bulls", 32, 17, 2, 2, 4],
      ["2026-11-02", "Sacramento Kings", 30, 13, 3, 1, 3],
      ["2026-10-16", "Golden State Warriors", 26, 9, 1, 2, 0],
    ],
  },
  {
    name: "Nate Okonkwo",
    teamName: "Dallas Mavericks",
    eventId: "event:demo-phx-dal",
    availability: { status: "unknown", detail: null },
    rows: [
      ["2026-10-18", "Boston Celtics", 34, 20, 7, 4, 1],
      ["2026-10-20", "Los Angeles Lakers", 36, 25, 8, 3, 2],
      ["2026-10-22", "Miami Heat", 33, 28, 6, 5, 1],
      ["2026-10-24", "Denver Nuggets", 30, 18, 9, 2, 0],
      ["2026-10-26", "New York Knicks", 35, 23, 5, 4, 2],
      ["2026-10-28", "Milwaukee Bucks", 37, 30, 7, 6, 3],
      ["2026-10-30", "Phoenix Suns", 32, 21, 8, 3, 1],
      ["2026-11-01", "Chicago Bulls", 29, 17, 6, 2, 0],
      ["2026-11-02", "Atlanta Hawks", 34, 24, 7, 4, 2],
      ["2026-11-02", "Indiana Pacers", 31, 22, 5, 3, 1],
    ],
  },
];

function logsFor(seed: PlayerSeed): GameLog[] {
  return seed.rows.map((row, index) => ({
    gameId: `${playerIdFromName(seed.name)}-${index}`,
    date: row[0],
    opponentName: row[1],
    minutes: row[2],
    stats: { pts: row[3], reb: row[4], ast: row[5], fg3m: row[6], stl: 1, blk: 0, turnover: 2 },
  }));
}

function makeOffer(input: {
  eventId: string;
  playerName: string;
  teamName: string;
  marketKey: string;
  side: Side;
  line: number;
  american: number;
}): Offer {
  const decimal = americanToDecimal(input.american);
  if (decimal == null) throw new Error("Demo odds must be priceable.");
  const playerId = playerIdFromName(input.playerName);
  return {
    id: `offer:${input.eventId}:${DEMO_BOOK}:${input.marketKey}:${playerId}:${input.side}:${input.line}`,
    eventId: input.eventId,
    marketKey: input.marketKey,
    playerId,
    playerName: input.playerName,
    teamName: input.teamName,
    bookmakerKey: DEMO_BOOK,
    bookmakerTitle: "Demo Book (fictional)",
    side: input.side,
    line: input.line,
    oddsAmerican: input.american,
    oddsDecimal: decimal,
    alternate: input.marketKey.endsWith("_alternate"),
    source: DEMO_SOURCE,
    fetchedAt: DEMO_FETCHED_AT,
    sourceUpdatedAt: DEMO_SOURCE_UPDATED_AT,
    fictional: true,
  };
}

function pair(
  seed: PlayerSeed,
  marketKey: string,
  line: number,
  over: number,
  under: number,
): Offer[] {
  return [
    makeOffer({
      eventId: seed.eventId,
      playerName: seed.name,
      teamName: seed.teamName,
      marketKey,
      side: "over",
      line,
      american: over,
    }),
    makeOffer({
      eventId: seed.eventId,
      playerName: seed.name,
      teamName: seed.teamName,
      marketKey,
      side: "under",
      line,
      american: under,
    }),
  ];
}

const byName = Object.fromEntries(players.map((player) => [player.name, player])) as Record<
  string,
  PlayerSeed
>;

export interface DemoSlate {
  events: SportEvent[];
  offers: Offer[];
  logs: Record<string, GameLog[]>;
  availability: Record<string, AvailabilityNote>;
}

export function demoSlate(): DemoSlate {
  const hale = byName["Jordan Hale"];
  const pell = byName["Andre Pell"];
  const ortega = byName["Miles Ortega"];
  const adelman = byName["Chris Adelman"];
  const brooks = byName["Evan Brooks"];
  const navarro = byName["Luis Navarro"];
  const cole = byName["Samir Cole"];
  const nate = byName["Nate Okonkwo"];
  const offers = [
    ...pair(hale, "player_points", 24.5, -115, -105),
    ...pair(hale, "player_points_alternate", 22.5, -145, 120),
    ...pair(hale, "player_points_alternate", 26.5, 105, -125),
    ...pair(hale, "player_rebounds", 6.5, -110, -110),
    ...pair(pell, "player_rebounds", 9.5, -120, 100),
    ...pair(pell, "player_rebounds_alternate", 8.5, -150, 125),
    ...pair(pell, "player_rebounds_alternate", 10.5, 110, -135),
    ...pair(ortega, "player_assists", 7.5, -110, -110),
    ...pair(ortega, "player_assists_alternate", 6.5, -140, 115),
    ...pair(adelman, "player_points", 21.5, -110, -110),
    ...pair(brooks, "player_points", 18.5, -105, -115),
    ...pair(navarro, "player_rebounds", 8.5, -110, -110),
    ...pair(cole, "player_threes", 2.5, 100, -120),
    ...pair(cole, "player_points", 16.5, -110, -110),
    ...pair(nate, "player_points", 22.5, -110, -110),
  ];
  const logs: DemoSlate["logs"] = {};
  const availability: DemoSlate["availability"] = {};
  for (const player of players) {
    const id = playerIdFromName(player.name);
    logs[id] = logsFor(player);
    availability[id] = {
      playerId: id,
      status: player.availability.status,
      detail: player.availability.detail,
      source: DEMO_SOURCE,
      fetchedAt: DEMO_FETCHED_AT,
      sourceUpdatedAt: DEMO_SOURCE_UPDATED_AT,
      fictional: true,
    };
  }
  return { events, offers, logs, availability };
}
