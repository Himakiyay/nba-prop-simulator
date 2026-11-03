"use client";

import { Button } from "@/components/ui/button";
import {
  eventLabel,
  formatAmerican,
  formatTipoff,
  marketLabel,
  type Offer,
  type PersistedState,
  type SportEvent,
} from "@/lib/domain";
import { buildResearchCard, preferBook } from "@/lib/research";
import { addSelection, alternatesFor } from "@/lib/slip";
import { activeSlip, withActiveSlip } from "@/lib/state";

const MARKETS = [
  { key: "player_points", label: "Points" },
  { key: "player_rebounds", label: "Rebounds" },
  { key: "player_assists", label: "Assists" },
  { key: "player_threes", label: "Threes" },
] as const;

export function GameBoard({
  events,
  offers,
  selectedId,
  market,
  loading,
  error,
  state,
  onSelectEvent,
  onSelectMarket,
  onChange,
  onError,
}: {
  events: SportEvent[];
  offers: Offer[];
  selectedId: string | null;
  market: string;
  loading: boolean;
  error: string | null;
  state: PersistedState;
  onSelectEvent: (id: string) => void;
  onSelectMarket: (key: string) => void;
  onChange: (state: PersistedState) => void;
  onError: (message: string) => void;
}) {
  const event = events.find((item) => item.id === selectedId) ?? null;
  const priced = preferBook(offers, null);
  const bookTitle = priced[0]?.bookmakerTitle;
  const rows = groupRows(priced.filter((offer) => offer.marketKey === market && !offer.alternate));

  function addOffer(offer: Offer) {
    if (!event) return;
    const card = buildResearchCard({
      offer,
      event,
      logs: [],
      availability: null,
      availabilityState: "unavailable",
      statsSource: null,
      availabilitySource: null,
      teamName: offer.teamName,
    });
    const slip = activeSlip(state);
    const edit = addSelection(slip, card, alternatesFor(offer, priced), new Date().toISOString());
    if (!edit.ok) {
      onError(edit.reason);
      return;
    }
    const next = withActiveSlip(state, edit.slip);
    onChange(edit.snapshot ? { ...next, snapshots: [...next.snapshots, edit.snapshot] } : next);
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-card/80 p-3 shadow-[0_0_40px_oklch(0.7_0.2_145/0.08)]">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Upcoming</p>
          <h2 className="text-lg font-semibold">Games</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {events.length} on the board{bookTitle ? ` · ${bookTitle}` : ""}
        </p>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {events.map((item) => {
          const active = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectEvent(item.id)}
              className={`min-w-40 shrink-0 rounded-2xl border px-3 py-2 text-left ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-white/10 bg-background/40 hover:border-primary/50"
              }`}
            >
              <p className="truncate text-sm font-semibold">{item.awayTeamName}</p>
              <p className="truncate text-sm font-semibold">at {item.homeTeamName}</p>
              <p className={`mt-1 text-[11px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {formatTipoff(item.commenceTime)}
              </p>
            </button>
          );
        })}
        {events.length === 0 && !loading ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">No upcoming games came back from the odds feed.</p>
        ) : null}
      </div>

      <div className="mt-3 flex gap-2">
        {MARKETS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelectMarket(item.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              market === item.key ? "bg-sky-500 text-white" : "bg-white/5 text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 rounded-xl bg-rose-950/50 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
      {loading ? <p className="mt-3 px-1 text-sm text-muted-foreground">Loading prices…</p> : null}

      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const sample = row.over ?? row.under;
          if (!sample) return null;
          return (
            <li
              key={`${sample.playerId}:${sample.marketKey}:${sample.line}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-background/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{sample.playerName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {event ? eventLabel(event) : ""} · {marketLabel(sample.marketKey)} {sample.line} · {sample.bookmakerTitle}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <OddsButton label="O" offer={row.over} onAdd={addOffer} />
                <OddsButton label="U" offer={row.under} onAdd={addOffer} />
              </div>
            </li>
          );
        })}
      </ul>
      {!loading && event && rows.length === 0 ? (
        <p className="mt-3 px-1 text-sm text-muted-foreground">
          No {marketLabel(market).toLowerCase()} prices are posted for this game yet. Books often add player props closer to tip.
        </p>
      ) : null}
    </section>
  );
}

function OddsButton({
  label,
  offer,
  onAdd,
}: {
  label: string;
  offer?: Offer;
  onAdd: (offer: Offer) => void;
}) {
  if (!offer) {
    return (
      <div className="grid h-12 w-16 place-items-center rounded-xl bg-white/5 text-xs text-muted-foreground">—</div>
    );
  }
  return (
    <Button
      type="button"
      className="h-12 w-16 flex-col gap-0 rounded-xl bg-primary px-0 text-primary-foreground hover:bg-primary/90"
      onClick={() => onAdd(offer)}
    >
      <span className="text-[10px] font-semibold tracking-wide uppercase">
        {label} {offer.line}
      </span>
      <span className="text-sm font-bold">{formatAmerican(offer.oddsAmerican)}</span>
    </Button>
  );
}

function groupRows(offers: Offer[]) {
  const map = new Map<string, { over?: Offer; under?: Offer }>();
  for (const offer of offers) {
    const key = `${offer.playerId}:${offer.line}`;
    const row = map.get(key) ?? {};
    row[offer.side] = offer;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => {
    const left = a.over ?? a.under;
    const right = b.over ?? b.under;
    return (left?.playerName ?? "").localeCompare(right?.playerName ?? "");
  });
}
