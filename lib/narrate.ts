import {
  BASELINE_MODEL_VERSION,
  formatAmerican,
  marketLabel,
  type ResearchCard,
  type UncertaintyReport,
} from "@/lib/domain";

const BANNED =
  /guaranteed|\block\b|safe bet|expected value|\bev\b|\bconfidence\b|sure bet|free money/i;

export function narrativeAllowed(text: string): boolean {
  return !BANNED.test(text);
}

export function narrateAnalyze(card: ResearchCard, assumedSide: boolean): string {
  const rate =
    card.hitRate.historicalRate == null
      ? "no decisive games were in the supplied logs"
      : `${card.hitRate.hits} of ${card.hitRate.decisive} decisive games finished ${card.offer.side} ${card.offer.line}`;
  const sentences = [
    `${card.offer.playerName} ${card.offer.side} ${card.offer.line} ${marketLabel(card.offer.marketKey).toLowerCase()} is quoted at ${formatAmerican(card.offer.oddsAmerican)} on ${card.offer.bookmakerTitle}.`,
    assumedSide
      ? "The request did not say over or under, so this uses the over."
      : "",
    `In the supplied logs, ${rate}. That historical rate is not a probability for the upcoming game.`,
    `The ranking score is ${card.baseline.score.toFixed(2)} under ${card.baseline.modelVersion}. It orders candidates from the shrunk hit rate, minutes, availability, and sample size.`,
    card.baseline.excludeReason
      ? `An automatic suggestion would skip this prop: ${card.baseline.excludeReason}`
      : "The evidence bar for an automatic suggestion is met. That still is not an edge.",
  ];
  return sentences.filter(Boolean).join(" ");
}

export function narrateCompare(left: ResearchCard, right: ResearchCard): string {
  return [
    `Both props are scored with ${BASELINE_MODEL_VERSION}. The higher score is only a research ordering.`,
    `${left.offer.playerName} ${left.offer.side} ${left.offer.line} ${marketLabel(left.offer.marketKey).toLowerCase()} has historical rate ${rateText(left)} and ranking score ${left.baseline.score.toFixed(2)}.`,
    `${right.offer.playerName} ${right.offer.side} ${right.offer.line} ${marketLabel(right.offer.marketKey).toLowerCase()} has historical rate ${rateText(right)} and ranking score ${right.baseline.score.toFixed(2)}.`,
    "Neither figure is a win probability, and the comparison does not estimate how the two results move together.",
  ].join(" ");
}

function rateText(card: ResearchCard): string {
  if (card.hitRate.historicalRate == null) return "unavailable (no decisive games)";
  return `${card.hitRate.hits}/${card.hitRate.decisive} decisive games`;
}

export function narrateSuggest(input: {
  chosen: ResearchCard[];
  requested: number;
  applied: boolean;
  limitations: string[];
}): string {
  if (input.chosen.length === 0) {
    return `I looked through the retrieved main-line overs and none cleared the evidence bar, so I did not invent picks to fill a ${input.requested}-selection slip. ${input.limitations.join(" ")}`;
  }
  const list = input.chosen
    .map(
      (card, index) =>
        `${index + 1}. ${card.offer.playerName} ${card.offer.side} ${card.offer.line} ${marketLabel(card.offer.marketKey).toLowerCase()} (${formatAmerican(card.offer.oddsAmerican)}, ranking score ${card.baseline.score.toFixed(2)})`,
    )
    .join(" ");
  const applied = input.applied
    ? "They were added to the empty paper slip, and the original quotes were snapshotted."
    : "The current slip already had selections, so I left it unchanged.";
  return `Proposed ${input.chosen.length} selection${input.chosen.length === 1 ? "" : "s"} with ${BASELINE_MODEL_VERSION}. ${list} ${applied} ${input.limitations.join(" ")} Historical hit rates are not win probabilities, and this is not a sportsbook parlay quote.`;
}

export function narrateUncertainty(report: UncertaintyReport): string {
  if (!report.biggest) {
    return "There is no paper slip to assess yet.";
  }
  const rest =
    report.items.length > 1
      ? ` Other recorded issues: ${report.items
          .slice(1)
          .map((item) => item.title.toLowerCase())
          .join("; ")}.`
      : "";
  return `${report.biggest.title} ${report.biggest.detail}${rest} This is not a probability, and it does not rank how likely the slip is to win.`;
}

export function narrateMarkets(): string {
  return "This desk can research points, rebounds, assists, threes, blocks, steals, and a few combined counting stats when a book returns them. Alternate lines are used only when that book response includes them. A market being supported here does not mean it is offered on tonight's slate. Yes/no props such as double-doubles are not priced in this version. Combined sportsbook parlay quotes are not retrieved.";
}
