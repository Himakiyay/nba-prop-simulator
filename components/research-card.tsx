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

export function ResearchCardView({
  card,
  onAdd,
}: {
  card: ResearchCard;
  onAdd?: (card: ResearchCard) => void;
}) {
  const statKey = statKeysForMarket(card.offer.marketKey)[0];
  return (
    <article className="rounded-xl border border-border bg-card/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
            {card.offer.fictional ? "Fictional demo quote" : "Live quote"}
          </p>
          <h3 className="mt-1 font-heading text-xl text-foreground">{card.offer.playerName}</h3>
          <p className="text-sm text-muted-foreground">
            {card.teamName ?? "Team not supplied"}
            {card.opponentName ? ` vs ${card.opponentName}` : ""}
            {" · "}
            {card.event.awayTeamName} at {card.event.homeTeamName}
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

      <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt className="text-foreground">Odds source</dt>
          <dd>{card.oddsSource.source}</dd>
          <dd>Fetched {formatWhen(card.oddsSource.fetchedAt)}</dd>
          <dd>
            Source updated{" "}
            {card.oddsSource.sourceUpdatedAt ? formatWhen(card.oddsSource.sourceUpdatedAt) : "not supplied"}
          </dd>
        </div>
        <div>
          <dt className="text-foreground">Logs</dt>
          <dd>{card.statsSource ? card.statsSource.source : "Unavailable"}</dd>
          <dd>
            {card.hitRate.historicalRate == null
              ? "No decisive games"
              : `${card.hitRate.hits} of ${card.hitRate.decisive} decisive games`}
          </dd>
          <dd>
            Sample {card.hitRate.sampleSize}
            {card.hitRate.pushes ? `, ${card.hitRate.pushes} push` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-foreground">Availability</dt>
          <dd>{card.availabilitySource ? card.availabilitySource.source : "Unavailable"}</dd>
          <dd>{card.availability ? card.availability.status : card.availabilityState}</dd>
          <dd>{card.availability?.detail ?? "No detail supplied"}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <EvidenceList title="Supporting" items={card.supporting} tone="support" />
        <EvidenceList title="Opposing" items={card.opposing} tone="oppose" />
        <EvidenceList title="Missing" items={card.missing} tone="missing" />
      </div>

      <div className="mt-4 rounded-lg bg-background/60 p-3">
        <p className="text-sm">
          Ranking score {card.baseline.score.toFixed(2)}{" "}
          <span className="text-muted-foreground">({card.baseline.modelVersion})</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {card.baseline.qualified
            ? "Meets the evidence bar for an automatic suggestion. That is not an edge."
            : card.baseline.excludeReason}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {card.baseline.factors.map((factor) => (
            <li key={factor.key}>
              {factor.label}: {factor.value.toFixed(2)} × {factor.weight.toFixed(2)}. {factor.note}
            </li>
          ))}
        </ul>
      </div>

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

      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {card.limitations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {onAdd ? (
        <Button className="mt-3" size="sm" onClick={() => onAdd(card)}>
          Add to paper slip
        </Button>
      ) : null}
    </article>
  );
}

function EvidenceList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "support" | "oppose" | "missing";
}) {
  const color =
    tone === "support" ? "text-emerald-200" : tone === "oppose" ? "text-rose-200" : "text-amber-100";
  return (
    <section>
      <h4 className={`text-xs tracking-wide uppercase ${color}`}>{title}</h4>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">None recorded.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs leading-5 text-foreground/90">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ModeBadge({ fictional }: { fictional: boolean | null }) {
  if (fictional == null) return null;
  return <Badge variant={fictional ? "secondary" : "outline"}>{fictional ? "Demo data" : "Live data"}</Badge>;
}
