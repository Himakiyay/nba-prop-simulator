import {
  formatAmerican,
  formatWhen,
  marketFamily,
  type LatestPrice,
  type Offer,
  type SameLinePrice,
  type SelectionSnapshot,
} from "@/lib/domain";

export function bestSameLinePrice(catalog: Offer[], offer: Pick<Offer, "eventId" | "playerId" | "marketKey" | "side" | "line">): SameLinePrice | null {
  const family = marketFamily(offer.marketKey);
  const pool = catalog.filter(
    (candidate) =>
      !candidate.alternate &&
      candidate.eventId === offer.eventId &&
      candidate.playerId === offer.playerId &&
      candidate.side === offer.side &&
      candidate.line === offer.line &&
      marketFamily(candidate.marketKey) === family,
  );
  if (pool.length === 0) return null;
  const best = pool.reduce((left, right) => (right.oddsAmerican > left.oddsAmerican ? right : left));
  return {
    bookmakerKey: best.bookmakerKey,
    bookmakerTitle: best.bookmakerTitle,
    line: best.line,
    oddsAmerican: best.oddsAmerican,
  };
}

export function bestPriceSentence(
  bookmakerTitle: string,
  oddsAmerican: number,
  best: SameLinePrice | null | undefined,
): string | null {
  if (!best) return null;
  if (best.bookmakerTitle === bookmakerTitle && best.oddsAmerican === oddsAmerican) {
    return "This was the best same-line price among the books in that fetch.";
  }
  return `The best same-line price in that fetch was ${formatAmerican(best.oddsAmerican)} at ${best.bookmakerTitle}.`;
}

export function matchLatestPrice(snapshot: Pick<SelectionSnapshot, "eventId" | "playerId" | "marketKey" | "side" | "line" | "bookmakerTitle">, offers: Offer[], fetchedAt: string): LatestPrice {
  const family = marketFamily(snapshot.marketKey);
  const pool = offers.filter(
    (offer) =>
      !offer.alternate &&
      offer.eventId === snapshot.eventId &&
      offer.playerId === snapshot.playerId &&
      offer.side === snapshot.side &&
      marketFamily(offer.marketKey) === family,
  );
  const sameBook = pool.filter((offer) => offer.bookmakerTitle === snapshot.bookmakerTitle);
  const sameLine = sameBook.find((offer) => offer.line === snapshot.line) ?? null;
  const moved = sameLine ? null : closestLine(sameBook, snapshot.line);
  const posted = sameLine ?? moved;
  const sameOriginalLine = pool.filter((offer) => offer.line === snapshot.line);
  const best = sameOriginalLine.length
    ? sameOriginalLine.reduce((left, right) => (right.oddsAmerican > left.oddsAmerican ? right : left))
    : null;
  return {
    fetchedAt,
    found: posted != null,
    bookmakerTitle: posted?.bookmakerTitle ?? null,
    line: posted?.line ?? null,
    oddsAmerican: posted?.oddsAmerican ?? null,
    bestBookmakerTitle: best?.bookmakerTitle ?? null,
    bestOddsAmerican: best?.oddsAmerican ?? null,
  };
}

function closestLine(offers: Offer[], line: number): Offer | null {
  if (offers.length === 0) return null;
  return [...offers].sort((left, right) => Math.abs(left.line - line) - Math.abs(right.line - line))[0] ?? null;
}

export function priceMoveSentence(
  captured: { oddsAmerican: number; line: number; bookmakerTitle: string },
  latest: LatestPrice | null | undefined,
  commenceTime: string,
  now: string,
): string {
  if (!latest) return "No later price has been retrieved.";
  const when = formatWhen(latest.fetchedAt);
  const afterTip = new Date(now).getTime() > new Date(commenceTime).getTime();
  const timing = afterTip ? " This check is after the listed tip." : "";
  if (!latest.found || latest.oddsAmerican == null || latest.line == null) {
    const elsewhere =
      latest.bestOddsAmerican != null && latest.bestBookmakerTitle
        ? ` The best price still posted at ${trimLine(captured.line)} was ${formatAmerican(latest.bestOddsAmerican)} at ${latest.bestBookmakerTitle}.`
        : "";
    return `${captured.bookmakerTitle} no longer had this side posted at ${when}.${elsewhere}${timing}`;
  }
  if (latest.line !== captured.line) {
    return `The line moved from ${trimLine(captured.line)} to ${trimLine(latest.line)}. ${latest.bookmakerTitle} was ${formatAmerican(latest.oddsAmerican)} on the new line at ${when}.${timing}`;
  }
  if (latest.oddsAmerican === captured.oddsAmerican) {
    return `Checked at ${when}, ${latest.bookmakerTitle} was still ${formatAmerican(captured.oddsAmerican)}.${timing}`;
  }
  const direction = latest.oddsAmerican > captured.oddsAmerican ? "drifted" : "shortened";
  const best =
    latest.bestOddsAmerican != null &&
    latest.bestBookmakerTitle &&
    (latest.bestBookmakerTitle !== latest.bookmakerTitle || latest.bestOddsAmerican !== latest.oddsAmerican)
      ? ` The best same-line price then was ${formatAmerican(latest.bestOddsAmerican)} at ${latest.bestBookmakerTitle}.`
      : "";
  return `The price ${direction} from ${formatAmerican(captured.oddsAmerican)} to ${formatAmerican(latest.oddsAmerican)} at ${latest.bookmakerTitle}, checked at ${when}.${best}${timing}`;
}

function trimLine(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
