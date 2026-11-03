import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatAmerican,
  formatDecimal,
  formatMoney,
  formatTipoff,
  type OddsFormat,
  type PersistedState,
} from "@/lib/domain";
import { bestPriceSentence, priceMoveSentence } from "@/lib/prices";
import { dependencyNotes, formatPercent, quoteSlip, type SlipQuote } from "@/lib/payout";
import { refreshStoredPrices } from "@/lib/refresh-prices";
import { recentLogLabels } from "@/lib/stats";
import { activeSlip, addSlip, removeSlip, setOddsFormat, withActiveSlip } from "@/lib/state";
import { removeSelection, selectStoredAlternate, setStake } from "@/lib/slip";

export function SlipPanel({
  state,
  onChange,
  onError,
}: {
  state: PersistedState;
  onChange: (state: PersistedState) => void;
  onError: (message: string) => void;
}) {
  const slip = activeSlip(state);
  const quote = quoteSlip(slip);
  const notes = dependencyNotes(slip.selections);
  const now = () => new Date().toISOString();
  const [checking, setChecking] = useState(false);

  async function checkPrices() {
    setChecking(true);
    const result = await refreshStoredPrices(
      state,
      slip.selections.map((selection) => selection.eventId),
    );
    setChecking(false);
    if (result.error) {
      onError(result.error);
      return;
    }
    onChange(result.state);
  }

  function commitStake(value: string) {
    const stake = Number(value);
    const edit = setStake(slip, stake, now());
    if (!edit.ok) {
      onError(edit.reason);
      return;
    }
    onChange(withActiveSlip(state, edit.slip));
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-2xl">Your slate</h2>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" disabled={checking || slip.selections.length === 0} onClick={() => void checkPrices()}>
              {checking ? "Checking…" : "Check prices"}
            </Button>
            <Badge variant="outline">No bet placed</Badge>
          </div>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Saved in this browser only. Clearing site data or switching browsers drops the slips.
          This is not a sportsbook ticket.
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-muted-foreground">Stake</span>
        <Input
          className="mt-1"
          type="number"
          min={0}
          max={100000}
          step="1"
          value={slip.stake}
          onChange={(event) => commitStake(event.target.value)}
        />
      </label>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={state.oddsFormat === "american" ? "default" : "outline"}
          onClick={() => onChange(setOddsFormat(state, "american"))}
        >
          American
        </Button>
        <Button
          size="sm"
          variant={state.oddsFormat === "decimal" ? "default" : "outline"}
          onClick={() => onChange(setOddsFormat(state, "decimal"))}
        >
          Decimal
        </Button>
      </div>

      <CombinedQuote quote={quote} format={state.oddsFormat} />

      {slip.selections.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-primary/30 p-4 text-sm text-muted-foreground">
          Empty slate. Use Get today’s slate, or tap a price on a game.
        </p>
      ) : (
        <ul className="space-y-3">
          {slip.selections.map((selection, index) => (
            <li key={selection.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Selection {index + 1}</p>
                  <p className="font-medium">{selection.playerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {selection.side} {selection.line} {selection.marketLabel.toLowerCase()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selection.eventLabel} · {formatTipoff(selection.commenceTime)}
                  </p>
                  <p className="text-sm text-primary">
                    {state.oddsFormat === "american"
                      ? formatAmerican(selection.oddsAmerican)
                      : formatDecimal(selection.oddsDecimal)}
                    {(() => {
                      const implied = quote.legs.find((leg) => leg.selectionId === selection.id)?.impliedProbability;
                      return implied == null ? "" : ` · ${formatPercent(implied)} implied`;
                    })()}{" "}
                    · {selection.bookmakerTitle}
                  </p>
                  <RecentLine selection={selection} />
                  {selection.role?.summary ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{selection.role.summary}</p>
                  ) : null}
                  <PriceLines selection={selection} snapshot={state.snapshots.find((item) => item.id === selection.snapshotId)} />
                  {selection.fictional ? (
                    <p className="text-xs text-amber-200">Fictional quote</p>
                  ) : null}
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    const edit = removeSelection(slip, selection.id, now());
                    if (!edit.ok) {
                      onError(edit.reason);
                      return;
                    }
                    onChange(withActiveSlip(state, edit.slip));
                  }}
                >
                  Remove
                </Button>
              </div>
              {selection.alternates.length > 1 ? (
                <label className="mt-2 block text-xs text-muted-foreground">
                  Supplied lines
                  <select
                    className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
                    value={selection.offerId}
                    onChange={(event) => {
                      const edit = selectStoredAlternate(slip, selection.id, event.target.value, now());
                      if (!edit.ok) {
                        onError(edit.reason);
                        return;
                      }
                      const next = withActiveSlip(state, edit.slip);
                      onChange(
                        edit.snapshot
                          ? { ...next, snapshots: [...next.snapshots, edit.snapshot] }
                          : next,
                      );
                    }}
                  >
                    {selection.alternates.map((alternate) => (
                      <option key={alternate.offerId} value={alternate.offerId}>
                        {alternate.side} {alternate.line}{" "}
                        {state.oddsFormat === "american"
                          ? formatAmerican(alternate.oddsAmerican)
                          : formatDecimal(alternate.oddsDecimal)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No alternate line was supplied for this quote.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {notes.map((note) => (
        <p key={note} className="rounded-lg bg-amber-950/40 p-3 text-sm text-amber-100">
          {note}
        </p>
      ))}

      {quote.invalidLegs.map((leg) => (
        <p key={leg.selectionId} className="text-sm text-rose-200">
          {leg.reason}
        </p>
      ))}

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Saved slips</h3>
          <Button size="xs" variant="outline" onClick={() => onChange(addSlip(state, now()))}>
            New slip
          </Button>
        </div>
        <ul className="mt-2 space-y-2">
          {state.slips.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                className={`text-left ${item.id === slip.id ? "text-primary" : "text-foreground"}`}
                onClick={() => onChange({ ...state, activeSlipId: item.id })}
              >
                {item.name} · {item.selections.length} picks
              </button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onChange(removeSlip(state, item.id, now()))}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PriceLines({
  selection,
  snapshot,
}: {
  selection: { bookmakerTitle: string; oddsAmerican: number; line: number; commenceTime: string; bestSameLine?: { bookmakerTitle: string; oddsAmerican: number; bookmakerKey: string; line: number } | null };
  snapshot?: { latestPrice?: Parameters<typeof priceMoveSentence>[1] };
}) {
  const best = bestPriceSentence(selection.bookmakerTitle, selection.oddsAmerican, selection.bestSameLine);
  const move = priceMoveSentence(
    selection,
    snapshot?.latestPrice,
    selection.commenceTime,
    new Date().toISOString(),
  );
  return (
    <div className="mt-1 space-y-1 text-xs text-muted-foreground">
      {best ? <p>{best}</p> : null}
      <p>{move}</p>
    </div>
  );
}

function RecentLine({
  selection,
}: {
  selection: { marketKey: string; logs: Parameters<typeof recentLogLabels>[0] };
}) {
  const recent = recentLogLabels(selection.logs, selection.marketKey);
  if (recent.length === 0) return <p className="mt-1 text-xs text-muted-foreground">Game log unavailable</p>;
  return <p className="mt-1 text-xs text-muted-foreground">Game log {recent.join(" · ")}</p>;
}

function CombinedQuote({ quote, format }: { quote: SlipQuote; format: OddsFormat }) {
  const combined = quote.illustrativeIndependent;
  if (quote.legs.length === 1) {
    const leg = quote.legs[0];
    return (
      <div className="rounded-2xl bg-primary/15 p-4">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Single</p>
        <p className="text-3xl font-bold text-primary">
          {format === "american" ? formatAmerican(leg.oddsAmerican) : formatDecimal(leg.oddsDecimal)}
        </p>
        <p className="mt-1 text-lg font-semibold">{formatPercent(leg.impliedProbability)} implied</p>
        <p className="mt-1 text-sm">
          {formatMoney(quote.stake)} returns {formatMoney(leg.totalReturn)} · profit {formatMoney(leg.netProfit)}
        </p>
      </div>
    );
  }
  if (quote.legs.length < 2) return null;
  if (!combined) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm">
        <p className="font-semibold">Combined sportsbook quote unavailable</p>
        <p className="mt-1 text-muted-foreground">
          Two or more picks share a game, so these prices are not multiplied into one payout.
        </p>
      </div>
    );
  }
  const price =
    format === "decimal" || combined.american == null
      ? combined.decimal.toFixed(2)
      : formatAmerican(combined.american);
  return (
      <div className="rounded-2xl border border-primary/40 bg-black/50 p-4">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Combined payout</p>
        <p className="text-4xl font-bold tracking-tight text-primary">{price}</p>
        <p className="mt-1 text-lg font-semibold">{formatPercent(combined.impliedProbability)} price-implied chance</p>
        <p className="mt-1 text-sm">
          {formatMoney(quote.stake)} returns {formatMoney(combined.totalReturn)} · profit {formatMoney(combined.netProfit)}
        </p>
      <p className="mt-2 text-xs text-muted-foreground">
        That percent is what these prices imply if every leg is independent. It is not a prediction, and it is not a sportsbook parlay price.
      </p>
    </div>
  );
}
