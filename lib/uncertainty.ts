import {
  marketFamily,
  type Slip,
  type SlipSelection,
  type UncertaintyItem,
  type UncertaintyReport,
} from "@/lib/domain";

export function explainUncertainty(slip: Slip): UncertaintyReport {
  if (slip.selections.length === 0) {
    return { biggest: null, items: [] };
  }
  const items: UncertaintyItem[] = [];
  const out = byStatus(slip.selections, "out");
  const doubtful = byStatus(slip.selections, "doubtful");
  const questionable = byStatus(slip.selections, "questionable");
  if (out.length) {
    items.push({
      title: "A player is listed out.",
      detail: `${names(out)} ${out.length === 1 ? "is" : "are"} listed out in the stored availability note. The quote may still be on the slip, but the logs do not make an out player playable.`,
    });
  }
  if (doubtful.length) {
    items.push({
      title: "A player is listed doubtful.",
      detail: `${names(doubtful)} ${doubtful.length === 1 ? "is" : "are"} listed doubtful. Playing time is unresolved.`,
    });
  }
  if (questionable.length) {
    items.push({
      title: "A player is listed questionable.",
      detail: `${names(questionable)} ${questionable.length === 1 ? "is" : "are"} listed questionable. Availability can change after this quote.`,
    });
  }
  const thin = slip.selections.filter((selection) => selection.logs.length < 5);
  if (thin.length) {
    items.push({
      title: "The game-log sample is thin.",
      detail: `${names(thin)} ${thin.length === 1 ? "has" : "have"} fewer than 5 stored logs on the selection. A short sample moves the ranking score more than a long one, and it is still not a probability.`,
    });
  }
  const missingAvailability = slip.selections.filter(
    (selection) =>
      selection.availabilityState !== "present" ||
      selection.availability?.status === "unknown",
  );
  if (missingAvailability.length) {
    items.push({
      title: "Availability is incomplete.",
      detail: `${names(missingAvailability)} ${missingAvailability.length === 1 ? "does" : "do"} not have a confirming availability classification in the stored quote. Absence from a report is not proof a player is available.`,
    });
  }
  const byEvent = new Map<string, SlipSelection[]>();
  for (const selection of slip.selections) {
    byEvent.set(selection.eventId, [...(byEvent.get(selection.eventId) ?? []), selection]);
  }
  for (const group of byEvent.values()) {
    if (group.length < 2) continue;
    items.push({
      title: "Selections share a game.",
      detail: `${names(group)} share ${group[0].eventLabel}. A faster or slower game can move both results, and the combined price stays unavailable.`,
    });
  }
  const samePlayer = new Map<string, SlipSelection[]>();
  for (const selection of slip.selections) {
    const key = `${selection.playerId}:${selection.eventId}`;
    samePlayer.set(key, [...(samePlayer.get(key) ?? []), selection]);
  }
  for (const group of samePlayer.values()) {
    const families = new Set(group.map((selection) => marketFamily(selection.marketKey)));
    if (families.size < 2) continue;
    items.push({
      title: "One player is in multiple markets.",
      detail: `${group[0].playerName} is on the slip in ${group.map((selection) => selection.marketLabel.toLowerCase()).join(" and ")}. Those results share the same minutes and game script.`,
    });
  }
  if (items.length === 0) {
    items.push({
      title: "The hit rate is not a prediction.",
      detail:
        "Every selection still depends on a historical rate, a heuristic ranking, and a quote that can move. No model here converts that into the chance the slip wins, and no sportsbook parlay price was retrieved.",
    });
  }
  return { biggest: items[0] ?? null, items };
}

function byStatus(selections: SlipSelection[], status: string): SlipSelection[] {
  return selections.filter((selection) => selection.availability?.status === status);
}

function names(selections: SlipSelection[]): string {
  return selections.map((selection) => selection.playerName).join(", ");
}
