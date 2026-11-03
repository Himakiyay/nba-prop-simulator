import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatAmerican,
  formatDecimal,
  formatMoney,
  formatTipoff,
  type PersistedState,
} from "@/lib/domain";
import { dependencyNotes, quoteSlip } from "@/lib/payout";
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
          <h2 className="font-heading text-2xl">Paper slip</h2>
          <Badge variant="outline">No bet placed</Badge>
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

      {slip.selections.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No selections yet. Ask for a slate suggestion or add a researched prop.
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
                      : formatDecimal(selection.oddsDecimal)}{" "}
                    · {selection.bookmakerTitle}
                  </p>
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

      <section className="rounded-lg border border-border p-3 text-sm">
        <h3 className="font-medium">Payout math</h3>
        <p className="mt-1 text-muted-foreground">Stake {formatMoney(quote.stake)}</p>
        {quote.legs.map((leg) => (
          <p key={leg.selectionId} className="mt-2">
            {leg.label} alone: total return {formatMoney(leg.totalReturn)}, net profit{" "}
            {formatMoney(leg.netProfit)}.
          </p>
        ))}
        {quote.invalidLegs.map((leg) => (
          <p key={leg.selectionId} className="mt-2 text-rose-200">
            {leg.reason}
          </p>
        ))}
        {quote.combinedSportsbookQuote === "unavailable" ? (
          <p className="mt-3 font-medium">Combined sportsbook quote unavailable</p>
        ) : null}
        {quote.illustrativeIndependent ? (
          <p className="mt-2 text-muted-foreground">
            {quote.illustrativeIndependent.label} Total return{" "}
            {formatMoney(quote.illustrativeIndependent.totalReturn)}, net profit{" "}
            {formatMoney(quote.illustrativeIndependent.netProfit)}.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">{quote.note}</p>
      </section>

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
