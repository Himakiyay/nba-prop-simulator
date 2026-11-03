import { describe, expect, it } from "vitest";
import { intentSchema } from "@/lib/schema";
import { parseIntent } from "@/lib/parse";
import { narrativeAllowed } from "@/lib/narrate";
import { createSlip } from "@/lib/slip";
import { createDemoProviders } from "@/lib/providers/demo";
import { handleTurn } from "@/lib/handle-turn";

const NOW = "2026-11-02T20:00:00.000Z";

describe("structured action validation", () => {
  it("parses the desk's core requests", () => {
    const slip = createSlip(NOW);
    expect(parseIntent("Research tonight's NBA games and suggest a four-pick slip.", slip).type).toBe(
      "suggest",
    );
    expect(parseIntent("Analyze Jordan Hale over 24.5 points.", slip)).toMatchObject({
      type: "analyze",
      player: "Jordan Hale",
      market: "player_points",
      side: "over",
      line: 24.5,
    });
    expect(parseIntent("Compare Andre Pell and Luis Navarro rebound props.", slip)).toMatchObject({
      type: "compare",
      player: "Andre Pell",
      otherPlayer: "Luis Navarro",
      market: "player_rebounds",
    });
    expect(parseIntent("Replace the second selection.", slip)).toMatchObject({
      type: "replace",
      index: 2,
    });
    expect(parseIntent("Lower this line to an available alternative.", slip).type).toBe("lower_line");
    expect(parseIntent("Explain the biggest uncertainty in this slip.", slip).type).toBe(
      "uncertainty",
    );
  });

  it("rejects a model payload that is not the intent schema", () => {
    const parsed = intentSchema.safeParse({
      type: "delete_database",
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
    });
    expect(parsed.success).toBe(false);
  });

  it("asks instead of guessing when a replacement index is missing", () => {
    const intent = parseIntent("Replace that pick.", createSlip(NOW));
    expect(intent.type).toBe("clarify");
    expect(intent.clarification).toBeTruthy();
  });

  it("blocks fictional provider data while live mode is selected", async () => {
    const turn = await handleTurn(
      {
        mode: "live",
        message: "Analyze Jordan Hale over 24.5 points.",
        slip: createSlip(NOW),
        now: NOW,
        recentOffers: [],
        limits: { slateEventLimit: 4, lookupEventLimit: 8, candidatePlayerCap: 12 },
      },
      createDemoProviders(),
    );
    expect(turn.fictional).toBe(false);
    expect(turn.narrative.toLowerCase()).toContain("fictional");
    expect(turn.cards).toHaveLength(0);
    expect(turn.slip.selections).toHaveLength(0);
  });

  it("discards guarantee language", () => {
    expect(narrativeAllowed("This is a guaranteed lock.")).toBe(false);
    expect(narrativeAllowed("The historical rate is not a probability.")).toBe(true);
  });
});
