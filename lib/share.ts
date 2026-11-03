import { z } from "zod";
import { formatAmerican, formatMoney, type Slip } from "@/lib/domain";
import { formatPercent, quoteSlip } from "@/lib/payout";
import { recentLogLabels } from "@/lib/stats";

const sharedSelectionSchema = z.object({
  player: z.string().min(1).max(80),
  side: z.enum(["over", "under"]),
  line: z.number(),
  market: z.string().min(1).max(40),
  marketKey: z.string().min(1).max(80),
  odds: z.number(),
  book: z.string().min(1).max(40),
  event: z.string().min(1).max(120),
  eventId: z.string().min(1).max(80),
  tip: z.string().max(80),
  log: z.string().max(180),
});

const sharedSlateSchema = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(80),
  stake: z.number().min(0).max(100000),
  selections: z.array(sharedSelectionSchema).min(1).max(8),
});

export type SharedSlate = z.infer<typeof sharedSlateSchema>;

export function slateFromSlip(slip: Slip): SharedSlate | null {
  if (slip.selections.length === 0) return null;
  return {
    v: 1,
    name: slip.name,
    stake: slip.stake,
    selections: slip.selections.slice(0, 8).map((selection) => ({
      player: selection.playerName,
      side: selection.side,
      line: selection.line,
      market: selection.marketLabel,
      marketKey: selection.marketKey,
      odds: selection.oddsAmerican,
      book: selection.bookmakerTitle,
      event: selection.eventLabel,
      eventId: selection.eventId,
      tip: selection.commenceTime,
      log: recentLogLabels(selection.logs, selection.marketKey).join(" · "),
    })),
  };
}

export function encodeShare(slate: SharedSlate): string {
  const bytes = new TextEncoder().encode(JSON.stringify(slate));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeShare(token: string): SharedSlate | null {
  if (!token || token.length > 8000) return null;
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((token.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = sharedSlateSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function describeSharedSlate(slate: SharedSlate): { price: string; chance: string; returns: string; note: string } {
  const quote = quoteSlip({
    stake: slate.stake,
    selections: slate.selections.map((selection, index) => ({
      id: String(index),
      playerName: selection.player,
      side: selection.side,
      line: selection.line,
      marketLabel: selection.market,
      oddsAmerican: selection.odds,
      eventId: selection.eventId,
      eventLabel: selection.event,
    })),
  } as Parameters<typeof quoteSlip>[0]);
  const combined = quote.illustrativeIndependent;
  if (quote.legs.length === 1) {
    const leg = quote.legs[0];
    return {
      price: formatAmerican(leg.oddsAmerican),
      chance: formatPercent(leg.impliedProbability),
      returns: `${formatMoney(quote.stake)} returns ${formatMoney(leg.totalReturn)}`,
      note: "One pick. The chance is what this price implies.",
    };
  }
  if (!combined) {
    return {
      price: "Unavailable",
      chance: "Separate picks",
      returns: "Prices stay separate because at least two picks share a game.",
      note: "Each price can be bet on its own at the stake above.",
    };
  }
  const price = combined.american == null ? combined.decimal.toFixed(2) : formatAmerican(combined.american);
  return {
    price,
    chance: formatPercent(combined.impliedProbability),
    returns: `${formatMoney(quote.stake)} returns ${formatMoney(combined.totalReturn)}`,
    note: "The chance is what these prices imply if the legs are independent.",
  };
}
