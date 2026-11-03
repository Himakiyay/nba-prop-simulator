import {
  FAMILY_STATS,
  marketFamily,
  marketLabel,
  type GameLog,
  type HitRate,
  type MinutesSummary,
  type Side,
  type StatKey,
} from "@/lib/domain";

export function statFromLog(marketKey: string, stats: GameLog["stats"]): number | null {
  const keys = FAMILY_STATS[marketFamily(marketKey)];
  if (!keys) return null;
  let total = 0;
  for (const key of keys) {
    const value = stats[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

export function statKeysForMarket(marketKey: string): StatKey[] {
  return FAMILY_STATS[marketFamily(marketKey)] ?? [];
}

export function computeHitRate(
  logs: GameLog[],
  marketKey: string,
  side: Side,
  line: number,
): HitRate {
  let hits = 0;
  let misses = 0;
  let pushes = 0;
  let sampleSize = 0;
  for (const log of logs) {
    const value = statFromLog(marketKey, log.stats);
    if (value == null) continue;
    sampleSize += 1;
    if (value === line) {
      pushes += 1;
    } else if (side === "over" ? value > line : value < line) {
      hits += 1;
    } else {
      misses += 1;
    }
  }
  const decisive = hits + misses;
  return {
    statLabel: marketLabel(marketKey),
    side,
    line,
    hits,
    misses,
    pushes,
    decisive,
    sampleSize,
    historicalRate: decisive > 0 ? hits / decisive : null,
  };
}

export function computeMinutes(logs: GameLog[]): MinutesSummary {
  const ordered = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const withMinutes = ordered.filter(
    (log) => log.minutes != null && Number.isFinite(log.minutes),
  );
  const average =
    withMinutes.length === 0
      ? null
      : withMinutes.reduce((sum, log) => sum + (log.minutes ?? 0), 0) / withMinutes.length;
  return {
    average,
    sampleSize: withMinutes.length,
    mostRecent: ordered[0]?.minutes ?? null,
  };
}

export function parseMinutes(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const [minutes, seconds] = trimmed.split(":");
    const whole = Number(minutes);
    const part = Number(seconds);
    if (!Number.isFinite(whole) || !Number.isFinite(part)) return null;
    return whole + part / 60;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
