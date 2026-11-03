"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAmerican,
  formatTipoff,
  formatWhen,
  type PersistedState,
  type SettlementStatus,
} from "@/lib/domain";
import { browserStore, readBrowserSnapshot, subscribeBrowserStore } from "@/lib/storage";
import { EMPTY_PERSISTED_STATE, gradeSnapshot, parsePersisted } from "@/lib/state";

const FILTERS: Array<SettlementStatus | "all"> = [
  "all",
  "pending",
  "won",
  "lost",
  "pushed",
  "void",
  "ungraded",
];

function readSaved(raw: string): { state: PersistedState | null; error: string | null } {
  if (!raw) return { state: null, error: null };
  try {
    const state = parsePersisted(JSON.parse(raw));
    return state
      ? { state, error: null }
      : { state: null, error: "Saved research in this browser could not be read." };
  } catch {
    return { state: null, error: "Saved research in this browser could not be read." };
  }
}

export function HistoryBoard() {
  const raw = useSyncExternalStore(subscribeBrowserStore, readBrowserSnapshot, () => "");
  const saved = readSaved(raw);
  const state = saved.state ?? EMPTY_PERSISTED_STATE;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const rows = state.snapshots.filter((snapshot) =>
    filter === "all" ? true : snapshot.settlement.status === filter,
  );
  const manual = state.snapshots.filter((snapshot) => snapshot.settlement.method === "manual");
  const count = (status: SettlementStatus) =>
    manual.filter((snapshot) => snapshot.settlement.status === status).length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-primary uppercase">Paper tracking</p>
          <h1 className="font-heading text-4xl">Quote history</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each row is a snapshot taken before the result was known. Editing a slip keeps the
            original snapshot. Results below are manual entries, not a downloaded settlement file,
            and they are stored in this browser only.
          </p>
        </div>
        <Link href="/" className="text-sm text-primary">
          Back to the desk
        </Link>
      </header>
      {saved.error ? (
        <p className="rounded-lg bg-rose-950/50 p-3 text-sm text-rose-100">{saved.error}</p>
      ) : null}
      <section className="rounded-xl border border-border p-4">
        <h2 className="font-medium">Manual paper record</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {count("won")} wins, {count("lost")} losses, {count("pushed")} pushes. Voids (
          {count("void")}) and ungraded ({count("ungraded")}) are excluded. This record is not a
          verified performance history and it says nothing about future results.
        </p>
      </section>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={filter === item ? "default" : "outline"}
            onClick={() => setFilter(item)}
          >
            {item}
          </Button>
        ))}
      </div>
      {state.snapshots.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          No snapshotted selections yet. A snapshot is written when a quote is added to a paper
          slip, before any result exists.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No snapshots in this status.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((snapshot) => (
            <li key={snapshot.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {snapshot.playerName} {snapshot.side} {snapshot.line}{" "}
                    {snapshot.marketLabel.toLowerCase()}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {snapshot.eventLabel} · {formatTipoff(snapshot.commenceTime)} ·{" "}
                    {formatAmerican(snapshot.oddsAmerican)} · {snapshot.bookmakerTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Captured {formatWhen(snapshot.createdAt)} · {snapshot.modelVersion}
                    {snapshot.replacesSnapshotId ? " · edit of an earlier snapshot" : ""}
                    {snapshot.evidence.fictional ? " · fictional demo quote" : " · live quote"}
                  </p>
                  <p className="mt-2 text-sm">
                    Historical rate:{" "}
                    {snapshot.evidence.hitRate.historicalRate == null
                      ? "no decisive games"
                      : `${snapshot.evidence.hitRate.hits} of ${snapshot.evidence.hitRate.decisive} decisive games`}
                    . Ranking score {snapshot.evidence.baseline.score.toFixed(2)}.
                  </p>
                </div>
                <Badge variant="secondary">
                  {snapshot.settlement.status}
                  {snapshot.settlement.method === "manual" ? " · manual" : ""}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["won", "lost", "pushed", "void", "ungraded", "pending"] as SettlementStatus[]).map(
                  (status) => (
                    <Button
                      key={status}
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        browserStore().write(
                          gradeSnapshot(state, snapshot.id, status, new Date().toISOString()),
                        )
                      }
                    >
                      {status === "pending" ? "Clear" : status}
                    </Button>
                  ),
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {snapshot.settlement.note ?? "No manual result entered."}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
