"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GameBoard } from "@/components/game-board";
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
import { MESSAGE_CHAR_LIMIT, type Offer, type PersistedState, type ResearchCard, type SportEvent } from "@/lib/domain";
import { browserStore, readBrowserSnapshot, subscribeBrowserStore } from "@/lib/storage";
import {
  activeSlip,
  addSlip,
  applyTurn,
  clearMessages,
  createInitialState,
  EMPTY_PERSISTED_STATE,
  parsePersisted,
  setMode,
  withActiveSlip,
} from "@/lib/state";
import { addSelection, alternatesFor } from "@/lib/slip";
import type { TurnResult } from "@/lib/turn";

const STARTERS = [
  "Best slate for today",
  "Research Tyrese Maxey's prop for today",
  "Research Cade Cunningham's points for today",
  "Add Tyrese Maxey to the slate",
];

interface BoardBody {
  events: SportEvent[];
  offers: Offer[];
  error: string | null;
}

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
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [market, setMarket] = useState("player_points");
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
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
          browserStore().write(setMode(createInitialState(new Date().toISOString()), "live"));
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
    let cancelled = false;
    fetch("/api/board")
      .then((response) => response.json())
      .then((body: BoardBody) => {
        if (cancelled) return;
        const nextEvents = body.events ?? [];
        setEvents(nextEvents);
        setBoardError(body.error);
        setSelectedId(nextEvents[0]?.id ?? null);
        if (nextEvents.length === 0) setBoardLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setBoardError("Upcoming games could not be loaded.");
          setBoardLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/board?eventId=${encodeURIComponent(selectedId)}`)
      .then((response) => response.json())
      .then((body: BoardBody) => {
        if (cancelled) return;
        if (body.events?.length) setEvents(body.events);
        setOffers(body.offers ?? []);
        setBoardError(body.error);
        setBoardLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setBoardError("Prices for that game could not be loaded.");
          setBoardLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

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
          mode: "live",
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

  function selectEvent(id: string) {
    if (id === selectedId) return;
    setBoardLoading(true);
    setOffers([]);
    setSelectedId(id);
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
  const liveGaps = [
    status && !status.odds ? "Live odds need THE_ODDS_API_KEY." : null,
    status && !status.stats ? "Live game logs need BALLDONTLIE_API_KEY." : null,
    status && !status.availability ? "Live availability needs BALLDONTLIE_API_KEY." : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/40 bg-black/50 px-4 py-3">
        <div>
          <p className="text-2xl leading-none font-bold tracking-tight">Baseline</p>
          <p className="text-xs tracking-[0.16em] text-primary uppercase">NBA slate</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={loading} onClick={() => send("Best slate for today")}>
            {loading ? "Building slate…" : "Get today’s slate"}
          </Button>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Live
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => commit(clearMessages(state))}
            disabled={state.messages.length === 0}
          >
            Clear chat
          </Button>
          <Link href="/history" className="hidden text-sm text-primary sm:inline">
            History
          </Link>
          <Sheet>
            <SheetTrigger
              render={<Button size="sm" variant="outline" className="lg:hidden" />}
            >
              Slate ({slip.selections.length})
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Your slate</SheetTitle>
              </SheetHeader>
              <SlipPanel state={state} onChange={commit} onError={setError} />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="flex min-h-0 flex-col">
          <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <GameBoard
              events={events}
              offers={offers}
              selectedId={selectedId}
              market={market}
              loading={boardLoading}
              error={boardError}
              state={state}
              onSelectEvent={selectEvent}
              onSelectMarket={setMarket}
              onChange={commit}
              onError={setError}
            />
            {status && !status.languageModel ? (
              <p className="px-1 text-xs leading-5 text-muted-foreground">
                Buttons and player names work now. For open-ended chat, create a free key at console.groq.com, add GROQ_API_KEY to .env.local, and restart. An OpenAI key in OPENAI_API_KEY works too.
              </p>
            ) : null}
            {liveGaps.length > 0 ? (
              <ul className="px-1 text-xs text-amber-100">
                {liveGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            ) : null}
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
              <p className="px-1 text-sm text-muted-foreground">
                Tap a price to add it, or use Get today’s slate for a 4-pick set with combined payout.
              </p>
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
                {message.warnings.filter((warning) => !warning.startsWith("Language model is not")).length > 0 ? (
                  <details className="text-xs text-amber-100">
                    <summary className="cursor-pointer">Feed notes</summary>
                    {[...new Set(message.warnings.filter((warning) => !warning.startsWith("Language model is not")))].map(
                      (warning) => (
                        <p key={warning} className="mt-1">
                          {warning}
                        </p>
                      ),
                    )}
                  </details>
                ) : null}
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
                Building the slate from today’s posted prices…
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
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="shrink-0 rounded-full border border-border px-3 py-1 text-left text-xs hover:border-primary/50"
                  onClick={() => send(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="research-prompt">
              Research request
            </label>
            <textarea
              id="research-prompt"
              value={draft}
              maxLength={MESSAGE_CHAR_LIMIT}
              rows={3}
              placeholder="Name a player, or ask for the best slate today."
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
                  New slate
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
