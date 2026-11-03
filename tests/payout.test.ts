import { describe, expect, it } from "vitest";
import type { SlipSelection } from "@/lib/domain";
import {
  americanToDecimal,
  decimalToAmerican,
  quoteSelection,
  quoteSlip,
} from "@/lib/payout";

function selection(patch: Partial<SlipSelection> & Pick<SlipSelection, "id" | "eventId" | "oddsAmerican">): SlipSelection {
  return {
    offerId: "offer",
    playerId: "player:test",
    playerName: "Test Player",
    teamName: "Home",
    opponentName: "Away",
    eventLabel: "Away at Home",
    commenceTime: "2026-11-03T03:00:00.000Z",
    marketKey: "player_points",
    marketLabel: "Points",
    side: "over",
    line: 20.5,
    bookmakerKey: "book",
    bookmakerTitle: "Book",
    oddsDecimal: americanToDecimal(patch.oddsAmerican) ?? 0,
    snapshotId: "snap",
    alternates: [],
    logs: [],
    availability: null,
    availabilityState: "unavailable",
    source: "test",
    fetchedAt: "2026-11-02T00:00:00.000Z",
    sourceUpdatedAt: null,
    fictional: true,
    ...patch,
  };
}

describe("payout math", () => {
  it("converts American and decimal odds", () => {
    expect(americanToDecimal(150)).toBe(2.5);
    expect(americanToDecimal(-110)).toBeCloseTo(1 + 100 / 110, 8);
    expect(americanToDecimal(0)).toBeNull();
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1)).toBeNull();
  });

  it("separates stake, total return, and net profit", () => {
    const leg = quoteSelection(
      {
        id: "s1",
        playerName: "Jordan Hale",
        side: "over",
        line: 24.5,
        marketLabel: "Points",
        oddsAmerican: 150,
      },
      10,
    );
    expect(leg).toMatchObject({ totalReturn: 25, netProfit: 15, stake: 10 });
  });

  it("labels an independent combination as illustrative and still unavailable as a book quote", () => {
    const quote = quoteSlip({
      stake: 10,
      selections: [
        selection({ id: "a", eventId: "g1", oddsAmerican: -110 }),
        selection({ id: "b", eventId: "g2", oddsAmerican: -110, playerName: "Other" }),
      ],
    });
    expect(quote.combinedSportsbookQuote).toBe("unavailable");
    expect(quote.illustrativeIndependent).not.toBeNull();
    expect(quote.illustrativeIndependent?.netProfit).toBeCloseTo(
      (quote.illustrativeIndependent?.totalReturn ?? 0) - 10,
      2,
    );
    expect(quote.note.toLowerCase()).toContain("pick'em");
    expect(quote.illustrativeIndependent?.label.toLowerCase()).not.toContain("sportsbook parlay quote is");
  });

  it("does not multiply same-game prices into a combined quote", () => {
    const quote = quoteSlip({
      stake: 25,
      selections: [
        selection({ id: "a", eventId: "same", oddsAmerican: 120 }),
        selection({ id: "b", eventId: "same", oddsAmerican: -130, playerName: "Teammate" }),
      ],
    });
    expect(quote.sameGameGroups).toHaveLength(1);
    expect(quote.illustrativeIndependent).toBeNull();
    expect(quote.combinedSportsbookQuote).toBe("unavailable");
    expect(quote.legs).toHaveLength(2);
    expect(quote.legs[0].netProfit).toBeCloseTo(quote.legs[0].totalReturn - 25, 2);
  });
});
