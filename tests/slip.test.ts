import { describe, expect, it } from "vitest";
import { createDemoProviders } from "@/lib/providers/demo";
import { handleTurn } from "@/lib/handle-turn";
import { createInitialState, activeSlip } from "@/lib/state";
import { createSlip } from "@/lib/slip";
import { readLimits } from "@/lib/providers/create";

const NOW = "2026-11-02T20:00:00.000Z";

async function researchHale() {
  const providers = createDemoProviders();
  const slip = createSlip(NOW);
  return handleTurn(
    {
      mode: "demo",
      message: "Analyze Jordan Hale over 24.5 points.",
      slip,
      now: NOW,
      recentOffers: [],
      limits: { slateEventLimit: 4, lookupEventLimit: 8, candidatePlayerCap: 12 },
    },
    providers,
  );
}

describe("slip validation", () => {
  it("rejects a second side of the same player market", async () => {
    const first = await researchHale();
    const card = first.cards[0];
    expect(card).toBeTruthy();
    const added = await handleTurn(
      {
        mode: "demo",
        message: "Add this to the slip",
        slip: first.slip,
        now: NOW,
        recentOffers: [
          {
            offerId: card.offer.id,
            eventId: card.offer.eventId,
            marketKey: card.offer.marketKey,
          },
        ],
        limits: { slateEventLimit: 4, lookupEventLimit: 8, candidatePlayerCap: 12 },
      },
      createDemoProviders(),
    );
    expect(added.slip.selections).toHaveLength(1);
    const under = await handleTurn(
      {
        mode: "demo",
        message: "Analyze Jordan Hale under 24.5 points.",
        slip: added.slip,
        now: NOW,
        recentOffers: [],
        limits: { slateEventLimit: 4, lookupEventLimit: 8, candidatePlayerCap: 12 },
      },
      createDemoProviders(),
    );
    const underCard = under.cards[0];
    const rejected = await handleTurn(
      {
        mode: "demo",
        message: "Add this to the slip",
        slip: added.slip,
        now: NOW,
        recentOffers: [
          {
            offerId: underCard.offer.id,
            eventId: underCard.offer.eventId,
            marketKey: underCard.offer.marketKey,
          },
        ],
        limits: { slateEventLimit: 4, lookupEventLimit: 8, candidatePlayerCap: 12 },
      },
      createDemoProviders(),
    );
    expect(rejected.slip.selections).toHaveLength(1);
    expect(rejected.rejected[0]?.reason.toLowerCase()).toContain("already");
  });

  it("rejects an offer id that was not retrieved", async () => {
    const turn = await handleTurn(
      {
        mode: "demo",
        message: "Add this to the slip",
        slip: createSlip(NOW),
        now: NOW,
        recentOffers: [
          {
            offerId: "offer:missing",
            eventId: "event:demo-lal-bos",
            marketKey: "player_points",
          },
        ],
        limits: { slateEventLimit: 4, lookupEventLimit: 8, candidatePlayerCap: 12 },
      },
      createDemoProviders(),
    );
    expect(turn.slip.selections).toHaveLength(0);
    expect(turn.narrative.toLowerCase()).toContain("not in the latest");
  });

  it("does not accept a line that was never supplied", async () => {
    const { selectStoredAlternate } = await import("@/lib/slip");
    const researched = await researchHale();
    const added = await handleTurn(
      {
        mode: "demo",
        message: "Add this to the slip",
        slip: researched.slip,
        now: NOW,
        recentOffers: [
          {
            offerId: researched.cards[0].offer.id,
            eventId: researched.cards[0].offer.eventId,
            marketKey: researched.cards[0].offer.marketKey,
          },
        ],
        limits: { slateEventLimit: 4, lookupEventLimit: 8, candidatePlayerCap: 12 },
      },
      createDemoProviders(),
    );
    const selection = added.slip.selections[0];
    const edit = selectStoredAlternate(added.slip, selection.id, "offer:not-supplied", NOW);
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.reason.toLowerCase()).toContain("not in the supplied");
  });

  it("keeps an empty initial slip", () => {
    expect(activeSlip(createInitialState(NOW)).selections).toHaveLength(0);
    expect(readLimits().slateEventLimit).toBeGreaterThan(0);
  });
});
