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

export function narrateAnalyze(
  card: ResearchCard,
  assumedSide: boolean,
  assumedMarket: boolean,
): string {
  const prop = `${card.offer.playerName} ${card.offer.side} ${card.offer.line} ${marketLabel(card.offer.marketKey).toLowerCase()}`;
  const read =
    card.hitRate.decisive === 0
      ? "There are not enough returned logs to judge it. The price is real, and the game log is missing."
      : card.baseline.qualified
        ? `${card.hitRate.hits} of ${card.hitRate.decisive} decisive games cleared this line. That is a past record, not the chance it wins.`
        : `${card.hitRate.hits} of ${card.hitRate.decisive} decisive games cleared this line, and the sample is too thin for a daily slate. That is still not a prediction.`;
  return [
    `${prop} is ${formatAmerican(card.offer.oddsAmerican)} at ${card.offer.bookmakerTitle}.`,
    assumedMarket ? "No market was named, so this uses the main points prop." : "",
    assumedSide ? "No over or under was named, so this uses the over." : "",
    read,
  ]
    .filter(Boolean)
    .join(" ");
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
    return "No posted overs came back for the games in this window.";
  }
  const list = input.chosen
    .map(
      (card) =>
        `${card.offer.playerName} ${card.offer.side} ${card.offer.line} ${marketLabel(card.offer.marketKey).toLowerCase()} (${formatAmerican(card.offer.oddsAmerican)})`,
    )
    .join(", ");
  const applied = input.applied
    ? "Added to your slate."
    : "Your slate already had picks, so it was left as-is. Say “replace the slate with this proposal” to swap it.";
  return `${list}. ${applied}`;
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
