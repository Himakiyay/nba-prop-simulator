import { describe, expect, it } from "vitest";
import { demoSlate } from "@/lib/demo/slate";
import { BASELINE_WEIGHTS, playerIdFromName } from "@/lib/domain";
import { scoreBaseline } from "@/lib/research";
import { computeHitRate, computeMinutes, parseMinutes } from "@/lib/stats";

describe("statistical calculations", () => {
  it("counts hits, misses, pushes, and sample size without treating the rate as a probability", () => {
    const logs = [
      { gameId: "1", date: "2026-10-01", opponentName: "A", minutes: 30, stats: { pts: 20 } },
      { gameId: "2", date: "2026-10-02", opponentName: "B", minutes: 28, stats: { pts: 18 } },
      { gameId: "3", date: "2026-10-03", opponentName: "C", minutes: 32, stats: { pts: 18 } },
    ];
    const rate = computeHitRate(logs, "player_points", "over", 18);
    expect(rate).toMatchObject({ hits: 1, misses: 0, pushes: 2, decisive: 1, sampleSize: 3 });
    expect(rate.historicalRate).toBe(1);
    const score = scoreBaseline({
      hits: rate.hits,
      decisive: rate.decisive,
      minutesAverage: 30,
      availabilityStatus: "available",
      availabilityState: "present",
    });
    expect(score.factors[0].note.toLowerCase()).toContain("not a win probability");
    expect(score.qualified).toBe(false);
  });

  it("uses the fictional Hale logs as a known sample", () => {
    const logs = demoSlate().logs[playerIdFromName("Jordan Hale")];
    const rate = computeHitRate(logs, "player_points", "over", 24.5);
    expect(rate.hits).toBe(8);
    expect(rate.decisive).toBe(10);
    expect(rate.sampleSize).toBe(10);
    const minutes = computeMinutes(logs);
    expect(minutes.average).toBe(33);
    expect(minutes.mostRecent).toBe(21);
  });

  it("parses clock minutes and leaves combined stats empty when a part is missing", () => {
    expect(parseMinutes("34:30")).toBeCloseTo(34.5, 5);
    expect(parseMinutes("")).toBeNull();
    const rate = computeHitRate(
      [
        {
          gameId: "1",
          date: "2026-10-01",
          opponentName: "A",
          minutes: 20,
          stats: { pts: 10, reb: 5 },
        },
      ],
      "player_points_rebounds_assists",
      "over",
      20.5,
    );
    expect(rate.sampleSize).toBe(0);
  });

  it("documents baseline weights that sum to 1", () => {
    const total = Object.values(BASELINE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 8);
  });
});
