import { describe, expect, it } from "vitest";
import { handleTurn } from "@/lib/handle-turn";
import { narrativeAllowed } from "@/lib/narrate";
import { createDemoProviders } from "@/lib/providers/demo";
import { memoryStore } from "@/lib/storage";
import { activeSlip, applyTurn, createInitialState, parsePersisted } from "@/lib/state";
import type { TurnInput } from "@/lib/turn";

const NOW = "2026-11-02T20:00:00.000Z";
const LIMITS = { slateEventLimit: 4, lookupEventLimit: 8, candidatePlayerCap: 12 };

function input(message: string, slip: TurnInput["slip"], recentOffers: TurnInput["recentOffers"] = []): TurnInput {
  return { mode: "demo", message, slip, now: NOW, recentOffers, limits: LIMITS };
}

describe("research workflow", () => {
  it("researches a prop, adds it, lowers the line, and restores the saved desk", async () => {
    const providers = createDemoProviders();
    let state = createInitialState(NOW);
    const researched = await handleTurn(
      input("Analyze Jordan Hale over 24.5 points.", activeSlip(state)),
      providers,
    );
    expect(researched.cards[0]?.offer.line).toBe(24.5);
    expect(researched.cards[0]?.hitRate.hits).toBe(8);
    expect(researched.cards[0]?.offer.fictional).toBe(true);
    expect(narrativeAllowed(researched.narrative)).toBe(true);
    state = applyTurn(state, researched, "Analyze Jordan Hale over 24.5 points.", NOW);

    const card = researched.cards[0];
    const added = await handleTurn(
      input("Add this to the slip", activeSlip(state), [
        { offerId: card.offer.id, eventId: card.offer.eventId, marketKey: card.offer.marketKey },
      ]),
      providers,
    );
    expect(added.slip.selections).toHaveLength(1);
    expect(added.slip.selections[0].line).toBe(24.5);
    expect(added.snapshots).toHaveLength(1);
    state = applyTurn(state, added, "Add this to the slip", NOW);

    const lowered = await handleTurn(
      input("Lower this line to an available alternative.", activeSlip(state)),
      providers,
    );
    expect(lowered.slip.selections[0].line).toBe(22.5);
    expect(lowered.slip.selections[0].oddsAmerican).toBe(-145);
    expect(lowered.snapshots[0]?.replacesSnapshotId).toBe(added.snapshots[0]?.id);
    expect(lowered.snapshots[0]?.line).toBe(22.5);
    state = applyTurn(state, lowered, "Lower this line to an available alternative.", NOW);

    const original = state.snapshots.find((snapshot) => snapshot.line === 24.5);
    const edited = state.snapshots.find((snapshot) => snapshot.line === 22.5);
    expect(original?.settlement.status).toBe("pending");
    expect(edited?.replacesSnapshotId).toBe(original?.id);
    expect(activeSlip(state).selections[0].line).toBe(22.5);

    const store = memoryStore();
    expect(parsePersisted(state)).not.toBeNull();
    store.write(state);
    const restored = store.read().state;
    expect(restored?.activeSlipId).toBe(state.activeSlipId);
    expect(activeSlip(restored!).selections[0].line).toBe(22.5);
    expect(restored?.snapshots.map((snapshot) => snapshot.line).sort()).toEqual([22.5, 24.5]);
  });

  it("skips players who miss the evidence bar when suggesting a slip", async () => {
    const turn = await handleTurn(
      input("Research tonight's NBA games and suggest a four-pick slip.", createInitialState(NOW).slips[0]),
      createDemoProviders(),
    );
    const names = turn.cards.map((card) => card.offer.playerName);
    expect(names).not.toContain("Luis Navarro");
    expect(names).not.toContain("Evan Brooks");
    expect(turn.cards.length).toBeGreaterThan(0);
    expect(turn.cards.length).toBeLessThanOrEqual(4);
    expect(turn.cards.every((card) => card.baseline.qualified)).toBe(true);
    expect(narrativeAllowed(turn.narrative)).toBe(true);
    expect(turn.narrative.toLowerCase()).not.toContain("guaranteed");
  });
});
