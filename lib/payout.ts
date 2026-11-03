import {
  formatAmerican,
  roundMoney,
  type Slip,
  type SlipSelection,
} from "@/lib/domain";

export function americanToDecimal(american: number): number | null {
  if (!Number.isFinite(american) || american === 0) return null;
  if (american > 0) return 1 + american / 100;
  return 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number | null {
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function impliedProbability(american: number): number | null {
  const decimal = americanToDecimal(american);
  if (decimal == null) return null;
  const probability = 1 / decimal;
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;
  return probability;
}

export function formatPercent(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

export interface LegQuote {
  selectionId: string;
  label: string;
  oddsAmerican: number;
  oddsDecimal: number;
  impliedProbability: number;
  stake: number;
  totalReturn: number;
  netProfit: number;
}

export interface SlipQuote {
  stake: number;
  legs: LegQuote[];
  invalidLegs: { selectionId: string; reason: string }[];
  sameGameGroups: { eventId: string; eventLabel: string; selectionIds: string[] }[];
  combinedSportsbookQuote: "unavailable" | "not_applicable";
  illustrativeIndependent: {
    label: string;
    decimal: number;
    american: number | null;
    impliedProbability: number;
    totalReturn: number;
    netProfit: number;
  } | null;
  note: string;
}

export function quoteSelection(
  selection: Pick<SlipSelection, "id" | "playerName" | "side" | "line" | "marketLabel" | "oddsAmerican">,
  stake: number,
): LegQuote | null {
  const decimal = americanToDecimal(selection.oddsAmerican);
  const probability = impliedProbability(selection.oddsAmerican);
  if (decimal == null || probability == null || !Number.isFinite(stake) || stake < 0) return null;
  const totalReturn = roundMoney(stake * decimal);
  return {
    selectionId: selection.id,
    label: `${selection.playerName} ${selection.side} ${selection.line} ${selection.marketLabel}`,
    oddsAmerican: selection.oddsAmerican,
    oddsDecimal: decimal,
    impliedProbability: probability,
    stake: roundMoney(stake),
    totalReturn,
    netProfit: roundMoney(totalReturn - stake),
  };
}

export function quoteSlip(slip: Pick<Slip, "stake" | "selections">): SlipQuote {
  const stake = roundMoney(slip.stake);
  const legs: LegQuote[] = [];
  const invalidLegs: SlipQuote["invalidLegs"] = [];

  for (const selection of slip.selections) {
    const leg = quoteSelection(selection, stake);
    if (!leg) {
      invalidLegs.push({
        selectionId: selection.id,
        reason: "American odds must be a non-zero finite number before a return can be calculated.",
      });
      continue;
    }
    legs.push(leg);
  }

  const groups = new Map<string, { eventId: string; eventLabel: string; selectionIds: string[] }>();
  for (const selection of slip.selections) {
    const group = groups.get(selection.eventId) ?? {
      eventId: selection.eventId,
      eventLabel: selection.eventLabel,
      selectionIds: [],
    };
    group.selectionIds.push(selection.id);
    groups.set(selection.eventId, group);
  }
  const sameGameGroups = [...groups.values()].filter((group) => group.selectionIds.length > 1);
  const sharesGame = sameGameGroups.length > 0;

  let illustrativeIndependent: SlipQuote["illustrativeIndependent"] = null;
  if (legs.length >= 2 && !sharesGame && invalidLegs.length === 0) {
    const decimal = legs.reduce((product, leg) => product * leg.oddsDecimal, 1);
    const probability = legs.reduce((product, leg) => product * leg.impliedProbability, 1);
    const totalReturn = roundMoney(stake * decimal);
    illustrativeIndependent = {
      label:
        "Combined price and the probability those prices imply if the legs are independent. Not a prediction and not a sportsbook parlay quote.",
      decimal,
      american: decimalToAmerican(decimal),
      impliedProbability: probability,
      totalReturn,
      netProfit: roundMoney(totalReturn - stake),
    };
  }

  const combinedSportsbookQuote: SlipQuote["combinedSportsbookQuote"] =
    slip.selections.length < 2 ? "not_applicable" : "unavailable";

  return {
    stake,
    legs,
    invalidLegs,
    sameGameGroups,
    combinedSportsbookQuote,
    illustrativeIndependent,
    note: "Stake, total return, and net profit are separate. Net profit is total return minus stake. No sportsbook parlay price is retrieved. Pick'em and DFS payout rules are not used.",
  };
}

export function dependencyNotes(
  selections: Pick<SlipSelection, "id" | "playerId" | "playerName" | "eventId" | "eventLabel" | "marketLabel">[],
): string[] {
  const notes: string[] = [];
  const byEvent = new Map<string, typeof selections>();
  const byPlayer = new Map<string, typeof selections>();
  for (const selection of selections) {
    byEvent.set(selection.eventId, [...(byEvent.get(selection.eventId) ?? []), selection]);
    byPlayer.set(selection.playerId, [...(byPlayer.get(selection.playerId) ?? []), selection]);
  }
  for (const group of byEvent.values()) {
    if (group.length < 2) continue;
    notes.push(
      `${group.map((item) => item.playerName).join(" and ")} are in the same game (${group[0].eventLabel}). That shared dependency is flagged only. This desk does not quantify correlation.`,
    );
  }
  for (const group of byPlayer.values()) {
    if (group.length < 2) continue;
    notes.push(
      `${group[0].playerName} appears in more than one market (${group.map((item) => item.marketLabel).join(", ")}). Those legs depend on the same player. Correlation is not estimated.`,
    );
  }
  return notes;
}

export function describeLeg(leg: LegQuote): string {
  return `${leg.label} at ${formatAmerican(leg.oddsAmerican)} (${leg.oddsDecimal.toFixed(2)} decimal)`;
}
