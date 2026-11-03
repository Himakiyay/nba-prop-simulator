import {
  createId,
  DEFAULT_STAKE,
  eventLabel,
  marketFamily,
  marketLabel,
  MAX_SLIP_SELECTIONS,
  type AlternateLine,
  type EvidenceSummary,
  type Offer,
  type ResearchCard,
  type SelectionSnapshot,
  type Slip,
  type SlipSelection,
  type SportEvent,
} from "@/lib/domain";
import { americanToDecimal } from "@/lib/payout";
import { buildResearchCard } from "@/lib/research";

export function createSlip(now: string, name = "Paper slip"): Slip {
  return {
    id: createId("slip"),
    name,
    stake: DEFAULT_STAKE,
    selections: [],
    createdAt: now,
    updatedAt: now,
    paper: true,
  };
}

export function evidenceFromCard(card: ResearchCard): EvidenceSummary {
  return {
    hitRate: card.hitRate,
    minutes: card.minutes,
    availability: card.availability,
    availabilityState: card.availabilityState,
    supporting: card.supporting,
    opposing: card.opposing,
    missing: card.missing,
    baseline: card.baseline,
    limitations: card.limitations,
    logs: card.logs,
    oddsSource: card.offer.source,
    oddsFetchedAt: card.offer.fetchedAt,
    oddsSourceUpdatedAt: card.offer.sourceUpdatedAt,
    fictional: card.offer.fictional,
    role: card.role ?? null,
  };
}

export function alternatesFor(offer: ResearchCard["offer"], catalog: ResearchCard["offer"][]): AlternateLine[] {
  return catalog
    .filter(
      (candidate) =>
        candidate.eventId === offer.eventId &&
        candidate.playerId === offer.playerId &&
        candidate.bookmakerKey === offer.bookmakerKey &&
        candidate.side === offer.side &&
        marketFamily(candidate.marketKey) === marketFamily(offer.marketKey),
    )
    .map((candidate) => ({
      offerId: candidate.id,
      marketKey: candidate.marketKey,
      side: candidate.side,
      line: candidate.line,
      oddsAmerican: candidate.oddsAmerican,
      oddsDecimal: candidate.oddsDecimal,
      bookmakerKey: candidate.bookmakerKey,
      bookmakerTitle: candidate.bookmakerTitle,
    }))
    .sort((a, b) => a.line - b.line);
}

function selectionFromCard(
  card: ResearchCard,
  alternates: AlternateLine[],
  snapshotId: string,
  selectionId: string,
): SlipSelection | null {
  const decimal = americanToDecimal(card.offer.oddsAmerican);
  if (decimal == null) return null;
  return {
    id: selectionId,
    offerId: card.offer.id,
    playerId: card.offer.playerId,
    playerName: card.offer.playerName,
    teamName: card.teamName,
    opponentName: card.opponentName,
    eventId: card.event.id,
    eventLabel: eventLabel(card.event),
    commenceTime: card.event.commenceTime,
    marketKey: card.offer.marketKey,
    marketLabel: marketLabel(card.offer.marketKey),
    side: card.offer.side,
    line: card.offer.line,
    bookmakerKey: card.offer.bookmakerKey,
    bookmakerTitle: card.offer.bookmakerTitle,
    oddsAmerican: card.offer.oddsAmerican,
    oddsDecimal: decimal,
    snapshotId,
    alternates,
    logs: card.logs,
    availability: card.availability,
    availabilityState: card.availabilityState,
    source: card.offer.source,
    fetchedAt: card.offer.fetchedAt,
    sourceUpdatedAt: card.offer.sourceUpdatedAt,
    fictional: card.offer.fictional,
    role: card.role ?? null,
    bestSameLine: card.bestSameLine ?? null,
  };
}

export function snapshotFromSelection(
  slipId: string,
  selection: SlipSelection,
  evidence: EvidenceSummary,
  now: string,
  replacesSnapshotId: string | null,
  stake: number,
): SelectionSnapshot {
  return {
    id: selection.snapshotId,
    createdAt: now,
    modelVersion: evidence.baseline.modelVersion,
    slipId,
    replacesSnapshotId,
    playerId: selection.playerId,
    playerName: selection.playerName,
    opponentName: selection.opponentName,
    eventId: selection.eventId,
    eventLabel: selection.eventLabel,
    commenceTime: selection.commenceTime,
    marketKey: selection.marketKey,
    marketLabel: selection.marketLabel,
    side: selection.side,
    line: selection.line,
    bookmakerTitle: selection.bookmakerTitle,
    oddsAmerican: selection.oddsAmerican,
    oddsDecimal: selection.oddsDecimal,
    offerId: selection.offerId,
    stake,
    evidence,
    bestSameLine: selection.bestSameLine ?? null,
    latestPrice: null,
    settlement: {
      status: "pending",
      method: "unset",
      settledAt: null,
      note: null,
    },
  };
}

export function conflictReason(
  slip: Slip,
  card: ResearchCard,
  ignoreSelectionId?: string,
): string | null {
  const family = marketFamily(card.offer.marketKey);
  for (const selection of slip.selections) {
    if (selection.id === ignoreSelectionId) continue;
    if (
      selection.playerId === card.offer.playerId &&
      selection.eventId === card.event.id &&
      marketFamily(selection.marketKey) === family
    ) {
      if (
        selection.side === card.offer.side &&
        selection.line === card.offer.line &&
        selection.bookmakerKey === card.offer.bookmakerKey
      ) {
        return "That selection is already on the slip.";
      }
      return "That player, game, and market are already on the slip. Replace the selection instead of adding another side or line.";
    }
  }
  if (!ignoreSelectionId && slip.selections.length >= MAX_SLIP_SELECTIONS) {
    return `A paper slip holds up to ${MAX_SLIP_SELECTIONS} selections.`;
  }
  return null;
}

export type SlipEdit =
  | { ok: true; slip: Slip; snapshot: SelectionSnapshot | null }
  | { ok: false; reason: string };

export function addSelection(
  slip: Slip,
  card: ResearchCard,
  alternates: AlternateLine[],
  now: string,
): SlipEdit {
  const reason = conflictReason(slip, card);
  if (reason) return { ok: false, reason };
  const snapshotId = createId("snap");
  const selection = selectionFromCard(card, alternates, snapshotId, createId("sel"));
  if (!selection) return { ok: false, reason: "The quoted American odds could not be priced." };
  const snapshot = snapshotFromSelection(slip.id, selection, evidenceFromCard(card), now, null, slip.stake);
  return {
    ok: true,
    snapshot,
    slip: {
      ...slip,
      updatedAt: now,
      selections: [...slip.selections, selection],
    },
  };
}

export function replaceSelection(
  slip: Slip,
  selectionId: string,
  card: ResearchCard,
  alternates: AlternateLine[],
  now: string,
): SlipEdit {
  const current = slip.selections.find((selection) => selection.id === selectionId);
  if (!current) return { ok: false, reason: "That selection is not on the slip." };
  const reason = conflictReason(slip, card, selectionId);
  if (reason) return { ok: false, reason };
  const snapshotId = createId("snap");
  const selection = selectionFromCard(card, alternates, snapshotId, current.id);
  if (!selection) return { ok: false, reason: "The quoted American odds could not be priced." };
  const snapshot = snapshotFromSelection(
    slip.id,
    selection,
    evidenceFromCard(card),
    now,
    current.snapshotId,
    slip.stake,
  );
  return {
    ok: true,
    snapshot,
    slip: {
      ...slip,
      updatedAt: now,
      selections: slip.selections.map((item) => (item.id === selectionId ? selection : item)),
    },
  };
}

export function removeSelection(slip: Slip, selectionId: string, now: string): SlipEdit {
  if (!slip.selections.some((selection) => selection.id === selectionId)) {
    return { ok: false, reason: "That selection is not on the slip." };
  }
  return {
    ok: true,
    snapshot: null,
    slip: {
      ...slip,
      updatedAt: now,
      selections: slip.selections.filter((selection) => selection.id !== selectionId),
    },
  };
}

export function setStake(slip: Slip, stake: number, now: string): SlipEdit {
  if (!Number.isFinite(stake) || stake < 0 || stake > 100_000) {
    return { ok: false, reason: "Stake must be between 0 and 100000." };
  }
  return {
    ok: true,
    snapshot: null,
    slip: { ...slip, stake: Math.round(stake * 100) / 100, updatedAt: now },
  };
}

export function selectionByIndex(slip: Slip, index: number | null): SlipSelection | null {
  if (index == null || index < 1 || index > slip.selections.length) return null;
  return slip.selections[index - 1] ?? null;
}

export function selectStoredAlternate(
  slip: Slip,
  selectionId: string,
  offerId: string,
  now: string,
): SlipEdit {
  const selection = slip.selections.find((item) => item.id === selectionId);
  if (!selection) return { ok: false, reason: "That selection is not on the slip." };
  const alternate = selection.alternates.find((item) => item.offerId === offerId);
  if (!alternate) {
    return { ok: false, reason: "That line is not in the supplied quotes for this selection." };
  }
  if (alternate.offerId === selection.offerId) return { ok: true, slip, snapshot: null };
  const [away, home] = selection.eventLabel.split(" at ");
  const event: SportEvent = {
    id: selection.eventId,
    awayTeamName: away || selection.eventLabel,
    homeTeamName: home || selection.eventLabel,
    commenceTime: selection.commenceTime,
  };
  const offer: Offer = {
    id: alternate.offerId,
    eventId: selection.eventId,
    marketKey: alternate.marketKey,
    playerId: selection.playerId,
    playerName: selection.playerName,
    teamName: selection.teamName,
    bookmakerKey: alternate.bookmakerKey,
    bookmakerTitle: alternate.bookmakerTitle,
    side: alternate.side,
    line: alternate.line,
    oddsAmerican: alternate.oddsAmerican,
    oddsDecimal: alternate.oddsDecimal,
    alternate: alternate.marketKey.endsWith("_alternate"),
    source: selection.source,
    fetchedAt: selection.fetchedAt,
    sourceUpdatedAt: selection.sourceUpdatedAt,
    fictional: selection.fictional,
  };
  const card = buildResearchCard({
    offer,
    event,
    logs: selection.logs,
    teamName: selection.teamName,
    availability: selection.availability,
    availabilityState: selection.availabilityState,
    statsSource: {
      source: selection.source,
      fetchedAt: selection.fetchedAt,
      sourceUpdatedAt: selection.sourceUpdatedAt,
      stale: false,
      fictional: selection.fictional,
    },
    availabilitySource: {
      source: selection.source,
      fetchedAt: selection.fetchedAt,
      sourceUpdatedAt: selection.sourceUpdatedAt,
      stale: false,
      fictional: selection.fictional,
    },
  });
  return replaceSelection(slip, selectionId, card, selection.alternates, now);
}
