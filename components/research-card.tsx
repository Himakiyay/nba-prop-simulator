import { Button } from "@/components/ui/button";
import {
  eventLabel,
  formatAmerican,
  formatTipoff,
  marketLabel,
  type ResearchCard,
} from "@/lib/domain";

export function ResearchCardView({
  card,
  onAdd,
}: {
  card: ResearchCard;
  onAdd?: (card: ResearchCard) => void;
}) {
  const record =
    card.hitRate.decisive > 0 ? `${card.hitRate.hits} of last ${card.hitRate.decisive}` : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-base font-semibold">{card.offer.playerName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {eventLabel(card.event)} · {formatTipoff(card.event.commenceTime)}
        </p>
        <p className="mt-1 text-sm">
          {card.offer.side} {card.offer.line} {marketLabel(card.offer.marketKey).toLowerCase()}
          {record ? ` · ${record}` : ""}
          {" · "}
          {card.offer.bookmakerTitle}
        </p>
      </div>
      {onAdd ? (
        <Button
          className="h-auto shrink-0 flex-col gap-0 rounded-xl bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90"
          onClick={() => onAdd(card)}
        >
          <span className="text-base font-bold">{formatAmerican(card.offer.oddsAmerican)}</span>
          <span className="text-[10px] font-semibold tracking-wide uppercase">Add</span>
        </Button>
      ) : (
        <p className="text-lg font-bold text-primary">{formatAmerican(card.offer.oddsAmerican)}</p>
      )}
    </div>
  );
}
