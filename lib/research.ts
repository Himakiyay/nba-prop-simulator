import {
  BASELINE_MODEL_VERSION,
  BASELINE_WEIGHTS,
  clamp,
  eventLabel,
  marketFamily,
  MIN_AVERAGE_MINUTES,
  MIN_DECISIVE_GAMES,
  normalizeName,
  PRIOR_GAMES,
  PRIOR_HITS,
  type AvailabilityNote,
  type AvailabilityState,
  type AvailabilityStatus,
  type BaselineScore,
  type GameLog,
  type Offer,
  type ResearchCard,
  type SourceStamp,
  type SportEvent,
} from "@/lib/domain";
import { bestSameLinePrice } from "@/lib/prices";
import { buildRoleRead, type SeasonOpponentSplit } from "@/lib/role";
import { computeHitRate, computeMinutes } from "@/lib/stats";

const AVAILABILITY_FACTOR: Record<AvailabilityStatus, number> = {
  available: 1,
  questionable: 0.55,
  doubtful: 0.25,
  out: 0,
  unknown: 0.45,
  not_listed: 0.5,
};

export function resolveOpponent(
  teamName: string | null,
  event: SportEvent,
): string | null {
  if (!teamName) return null;
  const team = normalizeName(teamName);
  if (team.length < 4) return null;
  const home = normalizeName(event.homeTeamName);
  const away = normalizeName(event.awayTeamName);
  const matches = (candidate: string) =>
    candidate.includes(team) || team.includes(candidate);
  if (matches(home) && !matches(away)) return event.awayTeamName;
  if (matches(away) && !matches(home)) return event.homeTeamName;
  return null;
}

export function scoreBaseline(input: {
  hits: number;
  decisive: number;
  minutesAverage: number | null;
  availabilityStatus: AvailabilityStatus | null;
  availabilityState: AvailabilityState;
}): BaselineScore {
  const shrunk =
    input.decisive > 0 ? (input.hits + PRIOR_HITS) / (input.decisive + PRIOR_GAMES) : 0;
  const minutesFactor =
    input.minutesAverage == null ? 0 : clamp(input.minutesAverage / 34, 0, 1);
  const availabilityValue =
    input.availabilityState === "unavailable"
      ? 0
      : AVAILABILITY_FACTOR[input.availabilityStatus ?? "unknown"];
  const sampleFactor = clamp(input.decisive / 8, 0, 1);
  const factors = [
    {
      key: "shrunk_hit_rate",
      label: "Shrunk historical hit rate",
      weight: BASELINE_WEIGHTS.shrunkHitRate,
      value: shrunk,
      note:
        input.decisive > 0
          ? `(${input.hits}+${PRIOR_HITS}) / (${input.decisive}+${PRIOR_GAMES}). The prior pulls small samples toward 0.50. This is not a win probability.`
          : "No decisive games, so this factor is 0. The shrinkage prior is not treated as evidence.",
    },
    {
      key: "minutes",
      label: "Minutes",
      weight: BASELINE_WEIGHTS.minutes,
      value: minutesFactor,
      note:
        input.minutesAverage == null
          ? "Minutes were not available."
          : `Average minutes ${input.minutesAverage.toFixed(1)} / 34, capped at 1.`,
    },
    {
      key: "availability",
      label: "Availability",
      weight: BASELINE_WEIGHTS.availability,
      value: availabilityValue,
      note:
        input.availabilityState === "unavailable"
          ? "The availability feed was unavailable, so this factor is 0."
          : `Status ${input.availabilityStatus ?? "unknown"} maps to ${availabilityValue.toFixed(2)} on a fixed scale.`,
    },
    {
      key: "sample",
      label: "Sample size",
      weight: BASELINE_WEIGHTS.sample,
      value: sampleFactor,
      note: `${input.decisive} decisive games / 8, capped at 1.`,
    },
  ];
  const score = factors.reduce((sum, factor) => sum + factor.weight * factor.value, 0);
  const reasons: string[] = [];
  if (input.availabilityStatus === "out") reasons.push("Availability is listed as out.");
  if (input.availabilityStatus === "doubtful") {
    reasons.push("Availability is listed as doubtful.");
  }
  if (input.decisive < MIN_DECISIVE_GAMES) {
    reasons.push(
      `Only ${input.decisive} decisive game${input.decisive === 1 ? "" : "s"} were supplied.`,
    );
  }
  if (input.minutesAverage == null) {
    reasons.push("Minutes were not available to check playing time.");
  } else if (input.minutesAverage < MIN_AVERAGE_MINUTES) {
    reasons.push(
      `Average minutes were ${input.minutesAverage.toFixed(1)}, below ${MIN_AVERAGE_MINUTES}.`,
    );
  }
  return {
    modelVersion: BASELINE_MODEL_VERSION,
    score,
    factors,
    qualified: reasons.length === 0,
    excludeReason: reasons.length ? reasons.join(" ") : null,
  };
}

function availabilitySentence(note: AvailabilityNote): string {
  const detail = note.detail ? ` ${note.detail}` : "";
  return `The availability feed lists this player as ${note.status}.${detail}`;
}

export function buildResearchCard(input: {
  offer: Offer;
  event: SportEvent;
  logs: GameLog[];
  availability: AvailabilityNote | null;
  availabilityState: AvailabilityState;
  statsSource: SourceStamp | null;
  availabilitySource: SourceStamp | null;
  teamName: string | null;
  catalog?: Offer[];
  position?: string | null;
  teammatesOut?: string[];
  seasonOpponent?: SeasonOpponentSplit | null;
}): ResearchCard {
  const logs = [...input.logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const teamName = input.offer.teamName ?? input.teamName;
  const hitRate = computeHitRate(logs, input.offer.marketKey, input.offer.side, input.offer.line);
  const minutes = computeMinutes(logs);
  const status =
    input.availabilityState === "present" ? (input.availability?.status ?? "unknown") : null;
  const baseline = scoreBaseline({
    hits: hitRate.hits,
    decisive: hitRate.decisive,
    minutesAverage: minutes.average,
    availabilityStatus: input.availabilityState === "not_listed" ? "not_listed" : status,
    availabilityState: input.availabilityState,
  });

  const supporting: string[] = [];
  const opposing: string[] = [];
  const missing: string[] = [];
  if (hitRate.decisive > 0) {
    const sentence = `In the supplied logs, ${hitRate.hits} of ${hitRate.decisive} decisive games finished ${hitRate.side} ${hitRate.line} ${hitRate.statLabel.toLowerCase()}.`;
    if ((hitRate.historicalRate ?? 0) >= 0.5) supporting.push(sentence);
    else opposing.push(sentence);
    if (hitRate.misses > 0 && (hitRate.historicalRate ?? 0) >= 0.5) {
      opposing.push(
        `${hitRate.misses} of ${hitRate.decisive} decisive games missed this ${hitRate.side}.`,
      );
    }
  } else {
    missing.push("No game logs with this statistic were returned.");
  }
  if (hitRate.pushes > 0) {
    missing.push(
      `${hitRate.pushes} game${hitRate.pushes === 1 ? "" : "s"} landed exactly on ${hitRate.line} and ${hitRate.pushes === 1 ? "is" : "are"} excluded from the historical rate.`,
    );
  }
  if (minutes.average != null) {
    const sentence = `Average minutes across ${minutes.sampleSize} log${minutes.sampleSize === 1 ? "" : "s"} with a time: ${minutes.average.toFixed(1)}.`;
    if (minutes.average >= 28) supporting.push(sentence);
    else opposing.push(sentence);
  } else {
    missing.push("Minutes were missing on the returned logs.");
  }
  if (
    minutes.mostRecent != null &&
    minutes.average != null &&
    minutes.mostRecent + 8 < minutes.average
  ) {
    opposing.push(
      `Most recent logged minutes were ${minutes.mostRecent.toFixed(1)}, below the sample average of ${minutes.average.toFixed(1)}.`,
    );
  }
  if (input.availabilityState === "unavailable") {
    missing.push("The availability feed was unavailable.");
  } else if (input.availabilityState === "not_listed") {
    missing.push(
      "This player was not listed on the retrieved injury report. That is not confirmation they are available.",
    );
  } else if (input.availability) {
    const sentence = availabilitySentence(input.availability);
    if (input.availability.status === "available") supporting.push(sentence);
    else if (input.availability.status === "unknown") {
      missing.push("No availability classification was supplied for this player.");
    } else opposing.push(sentence);
  }
  missing.push("No opponent-adjusted matchup split was supplied.");
  missing.push("Historical hit rate is not a future probability.");

  const limitations = [
    "The ranking score is a research heuristic, not a calibrated win probability or a betting edge.",
    "A past hit rate does not estimate the chance this prop wins.",
  ];
  if (
    input.offer.fictional ||
    input.statsSource?.fictional ||
    input.availabilitySource?.fictional ||
    input.availability?.fictional
  ) {
    limitations.push("This card uses fictional demo fixtures.");
  }
  if (input.statsSource?.stale || input.availabilitySource?.stale) {
    limitations.push("At least one source in this card is explicitly stale.");
  }

  return {
    offer: input.offer,
    event: input.event,
    teamName,
    opponentName: resolveOpponent(teamName, input.event),
    logs,
    hitRate,
    minutes,
    availability: input.availability,
    availabilityState: input.availabilityState,
    supporting,
    opposing,
    missing,
    baseline,
    limitations,
    oddsSource: {
      source: input.offer.source,
      fetchedAt: input.offer.fetchedAt,
      sourceUpdatedAt: input.offer.sourceUpdatedAt,
      stale: false,
      fictional: input.offer.fictional,
    },
    statsSource: input.statsSource,
    availabilitySource: input.availabilitySource,
    quotedLines: [],
    role: buildRoleRead({
      logs,
      marketKey: input.offer.marketKey,
      line: input.offer.line,
      opponentName: resolveOpponent(teamName, input.event),
      position: input.position,
      teammatesOut: input.teammatesOut,
      seasonOpponent: input.seasonOpponent,
    }),
    bestSameLine: input.catalog ? bestSameLinePrice(input.catalog, input.offer) : null,
  };
}

export function suggestFromCards(cards: ResearchCard[], count: number): {
  chosen: ResearchCard[];
  excluded: { playerName: string; marketLabel: string; reason: string }[];
  limitations: string[];
} {
  const anyQualified = cards.some((card) => card.baseline.qualified && card.offer.side === "over");
  const ranked = [...cards].sort((a, b) => {
    if (anyQualified) {
      const score = b.baseline.score - a.baseline.score;
      if (score) return score;
    }
    return (
      marketRank(a.offer.marketKey) - marketRank(b.offer.marketKey) ||
      Math.abs(a.offer.oddsAmerican + 110) - Math.abs(b.offer.oddsAmerican + 110) ||
      b.offer.line - a.offer.line ||
      a.offer.playerName.localeCompare(b.offer.playerName) ||
      a.offer.marketKey.localeCompare(b.offer.marketKey)
    );
  });
  const excluded = ranked
    .filter((card) => !card.baseline.qualified)
    .map((card) => ({
      playerName: card.offer.playerName,
      marketLabel: card.hitRate.statLabel,
      reason: card.baseline.excludeReason ?? "Evidence was insufficient.",
    }));
  const qualifiedPool = ranked.filter((card) => card.baseline.qualified && card.offer.side === "over");
  const usedPostedLines = qualifiedPool.length === 0;
  const pool = usedPostedLines
    ? ranked.filter(
        (card) =>
          card.offer.side === "over" &&
          !card.offer.alternate &&
          card.availability?.status !== "out" &&
          card.availability?.status !== "doubtful",
      )
    : qualifiedPool;
  const chosen: ResearchCard[] = [];
  const conflicts = (card: ResearchCard) =>
    chosen.some(
      (existing) =>
        existing.offer.playerId === card.offer.playerId &&
        marketFamily(existing.offer.marketKey) === marketFamily(card.offer.marketKey),
    );
  for (const card of pool) {
    if (chosen.length >= count) break;
    if (conflicts(card)) continue;
    if (chosen.some((existing) => existing.event.id === card.event.id)) continue;
    if (chosen.some((existing) => existing.offer.playerId === card.offer.playerId)) continue;
    chosen.push(card);
  }

  const limitations: string[] = [];
  if (usedPostedLines && chosen.length > 0) {
    limitations.push(
      "Recent logs were thin, so this slate spreads posted main overs across different games. It is not a stats ranking.",
    );
  } else if (chosen.length < count) {
    limitations.push(
      `Requested ${count} selections. ${chosen.length} cleared the evidence bar: at least ${MIN_DECISIVE_GAMES} decisive games, average minutes of at least ${MIN_AVERAGE_MINUTES}, and not listed out or doubtful.`,
    );
  }
  const byEvent = new Map<string, ResearchCard[]>();
  for (const card of chosen) {
    byEvent.set(card.event.id, [...(byEvent.get(card.event.id) ?? []), card]);
  }
  for (const group of byEvent.values()) {
    if (group.length < 2) continue;
    limitations.push(
      `${group.map((card) => card.offer.playerName).join(" and ")} share ${eventLabel(group[0].event)}. A faster or slower game can move both results. The combined price stays unavailable.`,
    );
  }
  limitations.push(
    "Automatic suggestions use main-line overs only. The score is a ranking heuristic, not a probability and not a claim of an edge.",
  );
  return { chosen, excluded, limitations };
}

export function capCandidates(offers: Offer[], playerCap: number): Offer[] {
  const byEvent = new Map<string, Offer[]>();
  for (const offer of offers) {
    byEvent.set(offer.eventId, [...(byEvent.get(offer.eventId) ?? []), offer]);
  }
  const queues = [...byEvent.values()].map((list) =>
    [...list].sort(
      (a, b) => a.playerName.localeCompare(b.playerName) || a.marketKey.localeCompare(b.marketKey),
    ),
  );
  const playerIds: string[] = [];
  let progressed = true;
  while (progressed && playerIds.length < playerCap) {
    progressed = false;
    for (const queue of queues) {
      while (queue.length && playerIds.includes(queue[0].playerId)) queue.shift();
      const next = queue.shift();
      if (!next) continue;
      playerIds.push(next.playerId);
      progressed = true;
      if (playerIds.length >= playerCap) break;
    }
  }
  const allowed = new Set(playerIds);
  return offers.filter((offer) => allowed.has(offer.playerId));
}

function marketRank(key: string): number {
  const order = ["player_points", "player_rebounds", "player_assists", "player_threes"];
  const index = order.indexOf(marketFamily(key));
  return index === -1 ? order.length : index;
}

export function preferBookPerEvent(offers: Offer[], preferred: string | null): Offer[] {
  const byEvent = new Map<string, Offer[]>();
  for (const offer of offers) {
    const group = byEvent.get(offer.eventId) ?? [];
    group.push(offer);
    byEvent.set(offer.eventId, group);
  }
  return [...byEvent.values()].flatMap((group) => preferBook(group, preferred));
}

export function preferBook(offers: Offer[], preferred: string | null): Offer[] {
  if (offers.length === 0) return [];
  const counts = new Map<string, number>();
  for (const offer of offers) {
    if (offer.alternate) continue;
    counts.set(offer.bookmakerKey, (counts.get(offer.bookmakerKey) ?? 0) + 1);
  }
  let best = offers[0].bookmakerKey;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (preferred) {
    const preferredCount = counts.get(preferred) ?? 0;
    if (preferredCount > 0 && preferredCount >= Math.max(8, Math.floor(bestCount * 0.6))) {
      return offers.filter((offer) => offer.bookmakerKey === preferred);
    }
  }
  return offers.filter((offer) => offer.bookmakerKey === best);
}
