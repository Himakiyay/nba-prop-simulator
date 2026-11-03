import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAmerican,
  formatDecimal,
  formatTipoff,
  formatWhen,
  marketLabel,
  type ResearchCard,
} from "@/lib/domain";
import { statFromLog, statKeysForMarket } from "@/lib/stats";

function readOn(card: ResearchCard): { title: string; detail: string } {
  if (card.hitRate.decisive === 0) {
    return {
      title: "Not enough logs to judge this",
      detail: "The price is from the odds feed. No decisive games came back, so this is not a read on whether the prop holds up.",
    };
  }
  const record = `${card.hitRate.hits} of ${card.hitRate.decisive} decisive games cleared this line.`;
  if (!card.baseline.qualified) {
    return {
      title: "Thin recent sample",
      detail: `${record} ${card.baseline.excludeReason ?? "That is not enough to put it on the daily slate."} A past rate is not the chance it wins.`,
    };
  }
  return {
    title: "Enough recent games to compare",
    detail: `${record} That is the past record, not a prediction, and it is not a sportsbook edge.`,
  };
}

export function ResearchCardView({
  card,
  onAdd,
}: {
  card: ResearchCard;
  onAdd?: (card: ResearchCard) => void;
}) {
  const statKey = statKeysForMarket(card.offer.marketKey)[0];
  const read = readOn(card);
  return (
    <article className="rounded-xl border border-border bg-card/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">{read.title}</p>
          <h3 className="mt-1 font-heading text-xl text-foreground">{card.offer.playerName}</h3>
          <p className="text-sm text-muted-foreground">
            Quoted for {card.event.awayTeamName} at {card.event.homeTeamName}
            {card.teamName ? ` · ${card.teamName}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">{formatTipoff(card.event.commenceTime)}</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-lg">
            {card.offer.side} {card.offer.line} {marketLabel(card.offer.marketKey).toLowerCase()}
          </p>
          <p className="text-sm text-primary">
            {formatAmerican(card.offer.oddsAmerican)} · {formatDecimal(card.offer.oddsDecimal)} decimal
          </p>
          <p className="text-xs text-muted-foreground">{card.offer.bookmakerTitle}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6">{read.detail}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {card.hitRate.decisive === 0
          ? "Logs: none returned"
          : `Logs: ${card.hitRate.hits} of ${card.hitRate.decisive}`}
        {" · "}
        {card.minutes.average == null ? "Minutes unavailable" : `${card.minutes.average.toFixed(1)} minutes`}
        {" · "}
        {card.availability
          ? card.availability.status
          : card.availabilityState === "not_listed"
            ? "Not on the injury report"
            : "Availability unavailable"}
        {" · "}
        {card.offer.bookmakerTitle}
        {card.offer.fictional ? " · fictional" : ""}
      </p>
      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-foreground">Sources and ranking math</summary>
        <p className="mt-2">
          Odds {card.oddsSource.source}, fetched {formatWhen(card.oddsSource.fetchedAt)}, source updated{" "}
          {card.oddsSource.sourceUpdatedAt ? formatWhen(card.oddsSource.sourceUpdatedAt) : "not supplied"}.
        </p>
        <p className="mt-1">
          Logs {card.statsSource?.source ?? "unavailable"}. Availability{" "}
          {card.availability?.detail ?? card.availabilityState}.
        </p>
        <ul className="mt-2 space-y-1">
          {card.baseline.factors.map((factor) => (
            <li key={factor.key}>
              {factor.label}: {factor.value.toFixed(2)} × {factor.weight.toFixed(2)}. {factor.note}
            </li>
          ))}
        </ul>
      </details>

      {card.logs.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 font-medium">Opponent</th>
                <th className="py-1 pr-3 font-medium">Minutes</th>
                <th className="py-1 font-medium">{card.hitRate.statLabel}</th>
              </tr>
            </thead>
            <tbody>
              {card.logs.map((log) => (
                <tr key={log.gameId} className="border-t border-border/70">
                  <td className="py-1 pr-3">{log.date}</td>
                  <td className="py-1 pr-3">{log.opponentName}</td>
                  <td className="py-1 pr-3">{log.minutes == null ? "—" : log.minutes.toFixed(1)}</td>
                  <td className="py-1">
                    {statKey ? (statFromLog(card.offer.marketKey, log.stats) ?? "—") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No game logs were returned for this player.</p>
      )}

      {onAdd ? (
        <Button className="mt-3" size="sm" onClick={() => onAdd(card)}>
          Add to slate
        </Button>
      ) : null}
    </article>
  );
}

export function ModeBadge({ fictional }: { fictional: boolean | null }) {
  if (fictional == null) return null;
  return <Badge variant={fictional ? "secondary" : "outline"}>{fictional ? "Demo data" : "Live data"}</Badge>;
}
