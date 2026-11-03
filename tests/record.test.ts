import { describe, expect, it } from "vitest";
import { createSlip } from "@/lib/slip";
import { legProfit, bettingRecord } from "@/lib/record";
import { decodeShare, describeSharedSlate, encodeShare, slateFromSlip } from "@/lib/share";
import type { SelectionSnapshot, SlipSelection } from "@/lib/domain";

describe("betting record", () => {
  it("pays a winner the profit and subtracts a loser", () => {
    expect(legProfit(10, -110, "won")).toBeCloseTo(10 * (100 / 110), 2);
    expect(legProfit(25, 150, "lost")).toBe(-25);
    expect(legProfit(10, -110, "pushed")).toBe(0);
    expect(legProfit(10, -110, "pending")).toBeNull();
  });

  it("ignores pending quotes that are no longer on a slate", () => {
    const record = bettingRecord({
      slips: [{ ...createSlip("2026-11-03T00:00:00.000Z"), selections: [] }],
      snapshots: [snapshot("pending", 10, -110, "snap-open"), snapshot("won", 10, -110, "snap-won")],
    });
    expect(record.openBets).toBe(0);
    expect(record.wins).toBe(1);
    expect(record.profit).toBeGreaterThan(0);
  });
});

describe("share links", () => {
  it("round-trips a slate and rejects junk", () => {
    const slip = createSlip("2026-11-03T00:00:00.000Z");
    slip.selections = [
      {
        id: "sel",
        offerId: "offer",
        playerId: "player",
        playerName: "Cade Cunningham",
        teamName: "Detroit Pistons",
        opponentName: "Philadelphia 76ers",
        eventId: "event",
        eventLabel: "Philadelphia 76ers at Detroit Pistons",
        commenceTime: "2026-11-05T00:00:00.000Z",
        marketKey: "player_points",
        marketLabel: "Points",
        side: "over",
        line: 23.5,
        bookmakerKey: "betrivers",
        bookmakerTitle: "BetRivers",
        oddsAmerican: -104,
        oddsDecimal: 1.96,
        snapshotId: "snap",
        alternates: [],
        logs: [{ gameId: "1", date: "2026-11-03", opponentName: "Hornets", minutes: 30, stats: { pts: 33 } }],
        availability: null,
        availabilityState: "not_listed",
        source: "test",
        fetchedAt: "2026-11-03T00:00:00.000Z",
        sourceUpdatedAt: null,
        fictional: false,
      } satisfies SlipSelection,
    ];
    const slate = slateFromSlip(slip);
    expect(slate).not.toBeNull();
    const decoded = decodeShare(encodeShare(slate!));
    expect(decoded?.selections[0].player).toBe("Cade Cunningham");
    expect(decoded?.selections[0].log).toContain("33");
    expect(decodeShare("not-a-slate")).toBeNull();
    const summary = describeSharedSlate(decoded!);
    expect(summary.price).toBe("-104");
    expect(summary.returns).toContain("$10.00");
  });
});

function snapshot(status: SelectionSnapshot["settlement"]["status"], stake: number, oddsAmerican: number, id: string): SelectionSnapshot {
  return {
    id,
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
    stake,
    evidence: {
      hitRate: {
        statLabel: "Points",
        side: "over",
        line: 20.5,
        hits: 0,
        misses: 0,
        pushes: 0,
        decisive: 0,
        sampleSize: 0,
        historicalRate: null,
      },
      minutes: { average: null, sampleSize: 0, mostRecent: null },
      availability: null,
      availabilityState: "unavailable",
      supporting: [],
      opposing: [],
      missing: [],
      baseline: { modelVersion: "baseline-heuristic-1", score: 0, factors: [], qualified: false, excludeReason: null },
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
