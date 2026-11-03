"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ResearchCardView } from "@/components/research-card";
import { SlipPanel } from "@/components/slip-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MESSAGE_CHAR_LIMIT, type PersistedState, type ResearchCard } from "@/lib/domain";
import { browserStore, readBrowserSnapshot, subscribeBrowserStore } from "@/lib/storage";
import {
  activeSlip,
  addSlip,
  applyTurn,
  createInitialState,
  EMPTY_PERSISTED_STATE,
  parsePersisted,
  setMode,
  withActiveSlip,
} from "@/lib/state";
import { addSelection, alternatesFor } from "@/lib/slip";
import type { TurnResult } from "@/lib/turn";

const STARTERS = [
  "Research tonight's NBA games and suggest a four-pick slip.",
  "Analyze Jordan Hale over 24.5 points.",
  "Compare Andre Pell and Luis Navarro rebound props.",
  "Explain the biggest uncertainty in this slip.",
];

interface StatusBody {
  defaultMode: "demo" | "live";
  odds: boolean;
  stats: boolean;
  availability: boolean;
  languageModel: boolean;
  modelVersion: string;
}

function readSaved(raw: string): { state: PersistedState | null; error: string | null } {
  if (!raw) return { state: null, error: null };
  try {
    const state = parsePersisted(JSON.parse(raw));
    return state
      ? { state, error: null }
      : { state: null, error: "Saved research in this browser could not be read. Start fresh to replace it." };
  } catch {
    return {
      state: null,
      error: "Saved research in this browser could not be read. Start fresh to replace it.",
    };
  }
}

export function Desk() {
  const raw = useSyncExternalStore(subscribeBrowserStore, readBrowserSnapshot, () => "");
  const saved = readSaved(raw);
  const [memory, setMemory] = useState<PersistedState | null>(null);
  const state = memory ?? saved.state ?? EMPTY_PERSISTED_STATE;
  const [status, setStatus] = useState<StatusBody | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  function commit(next: PersistedState) {
    if (saved.error) {
      setMemory(next);
      return;
    }
    browserStore().write(next);
    setMemory(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((response) => response.json())
      .then((body: StatusBody) => {
        if (cancelled) return;
        setStatus(body);
        const current = browserStore().read();
        if (!current.state && !current.rawError) {
          browserStore().write(setMode(createInitialState(new Date().toISOString()), body.defaultMode));
        }
      })
      .catch(() => {
        if (!cancelled) setError("The desk status could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [state?.messages.length, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!state || !trimmed || loading) return;
    if (trimmed.length > MESSAGE_CHAR_LIMIT) {
      setError(`Keep a request under ${MESSAGE_CHAR_LIMIT} characters.`);
      return;
    }
    const slip = activeSlip(state);
    const recent = [...state.messages].reverse().find((message) => message.role === "assistant");
    const recentOffers = (recent?.cards ?? []).slice(0, 6).map((card) => ({
      offerId: card.offer.id,
      eventId: card.offer.eventId,
      marketKey: card.offer.marketKey,
    }));
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: state.mode,
          message: trimmed,
          slip,
          recentOffers,
        }),
      });
      const body = (await response.json()) as TurnResult & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "The research request failed.");
        return;
      }
      commit(applyTurn(state, body, trimmed, new Date().toISOString()));
      setDraft("");
    } catch {
      setError("The research request could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  function addCard(card: ResearchCard) {
    if (!state) return;
    const slip = activeSlip(state);
    const lines = card.quotedLines.length > 0 ? card.quotedLines : alternatesFor(card.offer, [card.offer]);
    const edit = addSelection(slip, card, lines, new Date().toISOString());
    if (!edit.ok) {
      setError(edit.reason);
      return;
    }
    const next = withActiveSlip(state, edit.slip);
    commit(edit.snapshot ? { ...next, snapshots: [...next.snapshots, edit.snapshot] } : next);
  }

  const slip = activeSlip(state);
  const liveGaps =
    state.mode === "live"
      ? [
          status && !status.odds ? "Live odds need THE_ODDS_API_KEY." : null,
          status && !status.stats ? "Live game logs need BALLDONTLIE_API_KEY." : null,
          status && !status.availability ? "Live availability needs BALLDONTLIE_API_KEY." : null,
          status && !status.languageModel ? "Open-ended chat needs OPENAI_API_KEY." : null,
        ].filter((item): item is string => Boolean(item))
      : [];

  return (
    <main className="flex h-dvh flex-col bg-[radial-gradient(circle_at_top_left,rgba(230,179,90,0.08),transparent_32rem)]">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="font-heading text-2xl leading-none">Baseline</p>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
            NBA research desk
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={state.mode === "demo" ? "default" : "outline"}
            onClick={() => commit(setMode(state, "demo"))}
          >
            Demo
          </Button>
          <Button
            size="sm"
            variant={state.mode === "live" ? "default" : "outline"}
            onClick={() => commit(setMode(state, "live"))}
          >
            Live
          </Button>
          <Badge variant="secondary">{state.mode === "demo" ? "Fictional fixtures" : "Live providers"}</Badge>
          <Link href="/history" className="hidden text-sm text-primary sm:inline">
            History
          </Link>
          <Sheet>
            <SheetTrigger
              render={<Button size="sm" variant="outline" className="lg:hidden" />}
            >
              Slip ({slip.selections.length})
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Paper slip</SheetTitle>
              </SheetHeader>
              <SlipPanel state={state} onChange={commit} onError={setError} />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="flex min-h-0 flex-col">
          <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="rounded-xl border border-border bg-card/50 p-4 text-sm leading-6">
              <p>
                Ask for a slate, a player prop, a comparison, or an edit to the paper slip. Hit
                rates and ranking scores are calculated from retrieved logs. They are not win
                probabilities, and nothing here places a bet.
              </p>
              <p className="mt-2 text-muted-foreground">
                {state.mode === "demo"
                  ? "Demo mode is on. Players, quotes, logs, and injuries are fictional and labeled."
                  : "Live mode is on. Missing providers stay unavailable. Demo numbers are not filled in."}
              </p>
              {liveGaps.length > 0 ? (
                <ul className="mt-2 text-amber-100">
                  {liveGaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            {saved.error ? (
              <div className="rounded-lg bg-rose-950/50 p-3 text-sm text-rose-100">
                <p>{saved.error}</p>
                <Button
                  className="mt-2"
                  size="sm"
                  onClick={() => {
                    browserStore().write(createInitialState(new Date().toISOString()));
                    setMemory(null);
                  }}
                >
                  Start fresh in this browser
                </Button>
              </div>
            ) : null}
            {state.messages.length === 0 ? (
              <div>
                <p className="text-sm text-muted-foreground">Starter questions</p>
                <div className="mt-2 flex flex-col gap-2">
                  {STARTERS.map((prompt) => (
                    <button
                      key={prompt}
                      className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-primary/50"
                      onClick={() => send(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {state.messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-2xl rounded-xl bg-primary/15 px-4 py-3 text-sm"
                    : "max-w-3xl space-y-3"
                }
              >
                <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" && message.fictional ? (
                  <Badge variant="secondary">Fictional demo response</Badge>
                ) : null}
                {message.role === "assistant" && message.fictional === false ? (
                  <Badge variant="outline">Live response</Badge>
                ) : null}
                {message.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-100">
                    {warning}
                  </p>
                ))}
                {message.uncertainty?.biggest ? (
                  <div className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">{message.uncertainty.biggest.title}</p>
                    <p className="mt-1 text-muted-foreground">{message.uncertainty.biggest.detail}</p>
                  </div>
                ) : null}
                {message.cards.map((card) => (
                  <ResearchCardView key={card.offer.id} card={card} onAdd={addCard} />
                ))}
                {message.followUps.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {message.followUps.map((follow) => (
                      <Button key={follow} size="sm" variant="outline" onClick={() => send(follow)}>
                        {follow}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {loading ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Checking the slate and calculating from retrieved logs…
              </p>
            ) : null}
            {error ? <p className="rounded-lg bg-rose-950/50 p-3 text-sm text-rose-100">{error}</p> : null}
          </div>
          <form
            className="border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <label className="sr-only" htmlFor="research-prompt">
              Research request
            </label>
            <textarea
              id="research-prompt"
              value={draft}
              maxLength={MESSAGE_CHAR_LIMIT}
              rows={3}
              placeholder="Research a prop, compare two, or edit the slip."
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {draft.length}/{MESSAGE_CHAR_LIMIT} · {status?.modelVersion ?? "baseline-heuristic-1"} ·{" "}
                <Link href="/history" className="text-primary sm:hidden">
                  History
                </Link>
                <button
                  type="button"
                  className="hidden text-primary sm:inline"
                  onClick={() => commit(addSlip(state, new Date().toISOString()))}
                >
                  New slip
                </button>
              </p>
              <Button type="submit" disabled={loading || draft.trim().length === 0}>
                Research
              </Button>
            </div>
          </form>
        </section>
        <aside className="hidden min-h-0 border-l border-border lg:block">
          <SlipPanel state={state} onChange={commit} onError={setError} />
        </aside>
      </div>
    </main>
  );
}
