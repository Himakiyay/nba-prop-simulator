import { describe, expect, it } from "vitest";
import { calibrateSnapshots } from "@/lib/calibration";
import type { GameLog, Offer, SelectionSnapshot } from "@/lib/domain";
import { dependencyNotes } from "@/lib/payout";
import { bestPriceSentence, bestSameLinePrice, matchLatestPrice, priceMoveSentence } from "@/lib/prices";
import { buildRoleRead } from "@/lib/role";

const logs: GameLog[] = [
  { gameId: "1", date: "2026-11-03", opponentName: "Brooklyn Nets", minutes: 34, stats: { pts: 19 } },
  { gameId: "2", date: "2026-10-30", opponentName: "Philadelphia 76ers", minutes: 35, stats: { pts: 24 } },
  { gameId: "3", date: "2026-10-29", opponentName: "Chicago Bulls", minutes: 35, stats: { pts: 38 } },
];

function offer(patch: Partial<Offer>): Offer {
  return {
    id: "offer",
    eventId: "event",
    marketKey: "player_points",
    playerId: "player:jalen",
    playerName: "Jalen Brunson",
    teamName: "New York Knicks",
    bookmakerKey: "draftkings",
    bookmakerTitle: "DraftKings",
    side: "over",
    line: 26.5,
    oddsAmerican: -110,
    oddsDecimal: 1.91,
    alternate: false,
    source: "test",
    fetchedAt: "2026-11-03T00:00:00.000Z",
    sourceUpdatedAt: null,
    fictional: true,
    ...patch,
  };
}

describe("role note", () => {
  it("places the line inside the recent range and names the opponent split", () => {
    const role = buildRoleRead({
      logs,
      marketKey: "player_points",
      line: 26.5,
      opponentName: "Brooklyn Nets",
      position: "Guard",
      teammatesOut: ["Mitchell Robinson"],
      seasonOpponent: { games: 1, perGame: 19 },
    });
    expect(role.placement).toBe("inside");
    expect(role.summary).toContain("inside that range");
    expect(role.summary).toContain("19");
    expect(role.summary).toContain("Mitchell Robinson");
    expect(role.summary.toLowerCase()).toContain("guard");
  });

  it("marks a line outside the recent games", () => {
    const role = buildRoleRead({
      logs,
      marketKey: "player_points",
      line: 40.5,
      opponentName: null,
    });
    expect(role.placement).toBe("outside");
  });
});

describe("price watch", () => {
  it("keeps the best same-line price for the bettor", () => {
    const target = offer({ bookmakerKey: "betrivers", bookmakerTitle: "BetRivers", oddsAmerican: -118 });
    const best = bestSameLinePrice(
      [target, offer({ id: "b", bookmakerKey: "fanduel", bookmakerTitle: "FanDuel", oddsAmerican: -105 })],
      target,
    );
    expect(best?.bookmakerTitle).toBe("FanDuel");
    expect(bestPriceSentence("BetRivers", -118, best)).toContain("-105");
  });

  it("says the price shortened when the same book moves against the bettor", () => {
    const snapshot = {
      eventId: "event",
      playerId: "player:jalen",
      marketKey: "player_points",
      side: "over" as const,
      line: 26.5,
      bookmakerTitle: "DraftKings",
    };
    const latest = matchLatestPrice(
      snapshot,
      [offer({ oddsAmerican: -130, fetchedAt: "2026-11-04T18:00:00.000Z" })],
      "2026-11-04T18:00:00.000Z",
    );
    const sentence = priceMoveSentence(
      { oddsAmerican: -110, line: 26.5, bookmakerTitle: "DraftKings" },
      latest,
      "2026-11-05T02:00:00.000Z",
      "2026-11-04T18:00:00.000Z",
    );
    expect(sentence).toContain("shortened");
    expect(sentence).toContain("-130");
  });
});

describe("shared games", () => {
  it("explains teammates and a player's own markets", () => {
    const teammates = dependencyNotes([
      selection("a", "Jalen Brunson", "event-1", "player_points", "Points", "New York Knicks"),
      selection("b", "Karl-Anthony Towns", "event-1", "player_rebounds", "Rebounds", "New York Knicks"),
    ]);
    expect(teammates[0]).toContain("teammates");
    expect(teammates[0]).toContain("pace");
    const markets = dependencyNotes([
      selection("a", "Jalen Brunson", "event-1", "player_points", "Points", "New York Knicks"),
      { ...selection("a", "Jalen Brunson", "event-1", "player_assists", "Assists", "New York Knicks"), playerId: "player:jalen brunson" },
    ]);
    expect(markets[0]).toContain("minutes");
  });
});

describe("calibration", () => {
  it("groups graded picks by the chance the price implied", () => {
    const report = calibrateSnapshots([
      graded("won", -110),
      graded("lost", -110),
      graded("pending", -110),
      graded("pushed", 150),
    ]);
    expect(report.graded).toBe(2);
    expect(report.bands).toHaveLength(1);
    expect(report.bands[0].hits).toBe(1);
    expect(report.bands[0].count).toBe(2);
  });
});

function selection(
  id: string,
  playerName: string,
  eventId: string,
  marketKey: string,
  marketLabel: string,
  teamName: string,
) {
  return {
    playerId: `player:${playerName.toLowerCase()}`,
    playerName,
    eventId,
    eventLabel: "Brooklyn Nets at New York Knicks",
    marketKey,
    marketLabel,
    teamName,
  };
}

function graded(status: SelectionSnapshot["settlement"]["status"], oddsAmerican: number): SelectionSnapshot {
  return {
    id: `${status}-${oddsAmerican}`,
    createdAt: "2026-11-03T00:00:00.000Z",
    modelVersion: "baseline-heuristic-1",
    slipId: "slip",
    replacesSnapshotId: null,
    playerId: "player",
    playerName: "Player",
    opponentName: null,
    eventId: "event",
    eventLabel: "Away at Home",
    commenceTime: "2026-11-04T00:00:00.000Z",
    marketKey: "player_points",
    marketLabel: "Points",
    side: "over",
    line: 20.5,
    bookmakerTitle: "Book",
    oddsAmerican,
    oddsDecimal: 1.91,
    offerId: "offer",
    evidence: {
      hitRate: {
        statLabel: "Points",
        side: "over",
        line: 20.5,
        hits: 1,
        misses: 1,
        pushes: 0,
        decisive: 2,
        sampleSize: 2,
        historicalRate: 0.5,
      },
      minutes: { average: 30, sampleSize: 2, mostRecent: 30 },
      availability: null,
      availabilityState: "not_listed",
      supporting: [],
      opposing: [],
      missing: [],
      baseline: {
        modelVersion: "baseline-heuristic-1",
        score: 0.5,
        factors: [],
        qualified: false,
        excludeReason: null,
      },
      limitations: [],
      logs: [],
      oddsSource: "test",
      oddsFetchedAt: "2026-11-03T00:00:00.000Z",
      oddsSourceUpdatedAt: null,
      fictional: true,
    },
    settlement: {
      status,
      method: status === "pending" ? "unset" : "manual",
      settledAt: status === "pending" ? null : "2026-11-05T00:00:00.000Z",
      note: null,
    },
  };
}
