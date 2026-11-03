import {
  createId,
  DEFAULT_STAKE,
  MAX_STORED_MESSAGES,
  type ChatMessage,
  type OddsFormat,
  type Offer,
  type PersistedState,
  type SelectionSnapshot,
  type SettlementStatus,
  type Slip,
} from "@/lib/domain";
import { matchLatestPrice } from "@/lib/prices";
import { persistedSchema } from "@/lib/schema";
import { createSlip } from "@/lib/slip";
import type { TurnResult } from "@/lib/turn";

/** Stable empty desk used before this browser has a saved record. No random ids. */
export const EMPTY_PERSISTED_STATE: PersistedState = {
  version: 1,
  slips: [
    {
      id: "slip_placeholder",
      name: "Paper slip",
      stake: DEFAULT_STAKE,
      selections: [],
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
      paper: true,
    },
  ],
  activeSlipId: "slip_placeholder",
  snapshots: [],
  messages: [],
  oddsFormat: "american",
  mode: "demo",
};

export function createInitialState(now: string): PersistedState {
  const slip = createSlip(now);
  return {
    version: 1,
    slips: [slip],
    activeSlipId: slip.id,
    snapshots: [],
    messages: [],
    oddsFormat: "american",
    mode: "demo",
  };
}

export function clearMessages(state: PersistedState): PersistedState {
  return { ...state, messages: [] };
}

export function activeSlip(state: PersistedState): Slip {
  return state.slips.find((slip) => slip.id === state.activeSlipId) ?? state.slips[0];
}

export function withActiveSlip(state: PersistedState, slip: Slip): PersistedState {
  const exists = state.slips.some((item) => item.id === slip.id);
  return {
    ...state,
    activeSlipId: slip.id,
    slips: exists ? state.slips.map((item) => (item.id === slip.id ? slip : item)) : [...state.slips, slip],
  };
}

export function applyTurn(
  state: PersistedState,
  turn: TurnResult,
  userText: string,
  now: string,
): PersistedState {
  const user: ChatMessage = {
    id: createId("msg"),
    role: "user",
    content: userText,
    createdAt: now,
    cards: [],
    uncertainty: null,
    warnings: [],
    fictional: null,
    narrator: null,
    followUps: [],
  };
  const assistant: ChatMessage = {
    id: createId("msg"),
    role: "assistant",
    content: turn.narrative,
    createdAt: now,
    cards: turn.cards,
    uncertainty: turn.uncertainty,
    warnings: turn.warnings,
    fictional: turn.fictional,
    narrator: turn.narrator,
    followUps: turn.followUps,
  };
  const next = withActiveSlip(state, turn.slip);
  const known = new Set(next.snapshots.map((snapshot) => snapshot.id));
  return {
    ...next,
    snapshots: [
      ...next.snapshots,
      ...turn.snapshots.filter((snapshot) => !known.has(snapshot.id)),
    ],
    messages: [...next.messages, user, assistant].slice(-MAX_STORED_MESSAGES),
  };
}

export function applyRetrievedPrices(
  state: PersistedState,
  offers: Offer[],
  fetchedAt: string,
  eventIds: string[],
): PersistedState {
  const wanted = new Set(eventIds);
  return {
    ...state,
    snapshots: state.snapshots.map((snapshot) =>
      wanted.has(snapshot.eventId)
        ? { ...snapshot, latestPrice: matchLatestPrice(snapshot, offers, fetchedAt) }
        : snapshot,
    ),
  };
}

export function gradeSnapshot(
  state: PersistedState,
  snapshotId: string,
  status: SettlementStatus,
  now: string,
): PersistedState {
  return {
    ...state,
    snapshots: state.snapshots.map((snapshot) =>
      snapshot.id === snapshotId ? { ...snapshot, settlement: settlementFor(status, now) } : snapshot,
    ),
  };
}

function settlementFor(status: SettlementStatus, now: string): SelectionSnapshot["settlement"] {
  if (status === "pending") {
    return { status, method: "unset", settledAt: null, note: null };
  }
  return {
    status,
    method: "manual",
    settledAt: now,
    note: "Entered manually. This is not an official sportsbook settlement.",
  };
}

export function addSlip(state: PersistedState, now: string): PersistedState {
  const slip = createSlip(now, `Paper slip ${state.slips.length + 1}`);
  return { ...state, slips: [...state.slips, slip], activeSlipId: slip.id };
}

export function removeSlip(state: PersistedState, slipId: string, now: string): PersistedState {
  const remaining = state.slips.filter((slip) => slip.id !== slipId);
  if (remaining.length === 0) {
    const slip = createSlip(now);
    return { ...state, slips: [slip], activeSlipId: slip.id };
  }
  const activeSlipId = state.activeSlipId === slipId ? remaining[0].id : state.activeSlipId;
  return { ...state, slips: remaining, activeSlipId };
}

export function setMode(state: PersistedState, mode: PersistedState["mode"]): PersistedState {
  return { ...state, mode };
}

export function setOddsFormat(state: PersistedState, oddsFormat: OddsFormat): PersistedState {
  return { ...state, oddsFormat };
}

export function parsePersisted(value: unknown): PersistedState | null {
  const parsed = persistedSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
