"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { formatAmerican, formatTipoff } from "@/lib/domain";
import { decodeShare, describeSharedSlate } from "@/lib/share";

function subscribeHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

export default function SharePage() {
  const token = useSyncExternalStore(subscribeHash, () => window.location.hash.replace(/^#/, ""), () => "");
  const slate = token ? decodeShare(token) : null;
  const error = token
    ? slate
      ? null
      : "This share link could not be read."
    : "This page is empty until you open a share link from a slate.";
  const summary = slate ? describeSharedSlate(slate) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Shared slate</p>
        <h1 className="mt-1 text-3xl font-bold">{slate?.name ?? "Baseline"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Someone sent this NBA prop slate. It shows the prices and the payout math. It does not place a bet.
        </p>
        <Link href="/" className="mt-3 inline-block text-sm text-primary">
          Open the desk
        </Link>
      </header>
      {error ? <p className="rounded-xl border border-dashed border-primary/30 p-4 text-sm text-muted-foreground">{error}</p> : null}
      {slate && summary ? (
        <>
          <section className="rounded-2xl border border-primary/40 bg-black/50 p-4">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">At {formatStake(slate.stake)}</p>
            <p className="text-4xl font-bold text-primary">{summary.price}</p>
            <p className="mt-1 text-lg font-semibold">{summary.chance} price-implied</p>
            <p className="mt-1 text-sm">{summary.returns}</p>
            <p className="mt-2 text-xs text-muted-foreground">{summary.note}</p>
          </section>
          <ul className="space-y-3">
            {slate.selections.map((selection) => (
              <li key={`${selection.eventId}:${selection.player}:${selection.market}`} className="rounded-2xl border border-white/10 bg-card px-4 py-3">
                <p className="font-semibold">{selection.player}</p>
                <p className="text-sm">
                  {selection.side} {selection.line} {selection.market.toLowerCase()} · {formatAmerican(selection.odds)} · {selection.book}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selection.event} · {formatTipoff(selection.tip)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{selection.log ? `Game log ${selection.log}` : "Game log unavailable"}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}

function formatStake(stake: number): string {
  return `$${stake.toFixed(2)} stake`;
}
