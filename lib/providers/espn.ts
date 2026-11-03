import { normalizeName, type AvailabilityNote, type AvailabilityStatus, type GameLog } from "@/lib/domain";
import { providerCache } from "@/lib/providers/cache";
import type { AvailabilityProvider, StatsProvider } from "@/lib/providers/types";
import { parseMinutes } from "@/lib/stats";
import { okResult, unavailable, type DataResult } from "@/lib/result";

const SOURCE = "espn";
const SEARCH_URL = "https://site.api.espn.com/apis/common/v3/search";
const INJURY_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function getJson(url: string): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json", "User-Agent": "BaselineNBA/0.1" },
    });
    if (!response.ok) return { ok: false, message: `ESPN returned HTTP ${response.status}.` };
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, message: "The ESPN request failed before a response arrived." };
  }
}

function titleFromSlug(slug: string): string {
  return decodeURIComponent(slug)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function teamNameFromEvent(event: unknown): string | null {
  const team = record(record(event)?.team);
  if (!team) return null;
  if (typeof team.displayName === "string" && team.displayName.trim()) return team.displayName.trim();
  const links = Array.isArray(team.links) ? team.links : [];
  for (const link of links) {
    const href = record(link)?.href;
    if (typeof href !== "string") continue;
    const match = href.match(/\/nba\/team\/_\/name\/[^/]+\/([^/?#]+)/);
    if (match?.[1]) return titleFromSlug(match[1]);
  }
  return typeof team.abbreviation === "string" && team.abbreviation.trim() ? team.abbreviation.trim() : null;
}

export function logsFromGamelog(body: unknown): GameLog[] {
  const root = record(body);
  if (!root) return [];
  const names = stringArray(root.names);
  const events = record(root.events) ?? {};
  const rows: { eventId: string; stats: string[] }[] = [];
  for (const season of Array.isArray(root.seasonTypes) ? root.seasonTypes : []) {
    const categories = record(season)?.categories;
    for (const category of Array.isArray(categories) ? categories : []) {
      const list = record(category)?.events;
      for (const item of Array.isArray(list) ? list : []) {
        const row = record(item);
        const eventId = typeof row?.eventId === "string" ? row.eventId : null;
        const stats = Array.isArray(row?.stats) ? row.stats.map((cell) => String(cell)) : null;
        if (eventId && stats) rows.push({ eventId, stats });
      }
    }
  }
  const indexOf = (name: string) => names.indexOf(name);
  const cell = (stats: string[], name: string) => {
    const index = indexOf(name);
    return index >= 0 ? stats[index] : undefined;
  };
  const numberCell = (stats: string[], name: string) => {
    const raw = cell(stats, name);
    if (!raw || raw === "--") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const madeCell = (stats: string[], name: string) => {
    const raw = cell(stats, name);
    if (!raw || !raw.includes("-")) return undefined;
    const value = Number(raw.split("-")[0]);
    return Number.isFinite(value) ? value : undefined;
  };
  const logs: GameLog[] = [];
  for (const row of rows) {
    const event = record(events[row.eventId]);
    const date = typeof event?.gameDate === "string" ? event.gameDate.slice(0, 10) : "";
    if (!date) continue;
    const opponent = record(event?.opponent);
    logs.push({
      gameId: row.eventId,
      date,
      opponentName: typeof opponent?.displayName === "string" ? opponent.displayName : "Opponent not supplied",
      minutes: parseMinutes(cell(row.stats, "minutes") ?? null),
      stats: {
        pts: numberCell(row.stats, "points"),
        reb: numberCell(row.stats, "totalRebounds"),
        ast: numberCell(row.stats, "assists"),
        fg3m: madeCell(row.stats, "threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
        stl: numberCell(row.stats, "steals"),
        blk: numberCell(row.stats, "blocks"),
        turnover: numberCell(row.stats, "turnovers"),
      },
    });
  }
  return logs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
}

function mapInjuryStatus(status: string): AvailabilityStatus {
  const value = status.toLowerCase();
  if (value.includes("out")) return "out";
  if (value.includes("doubtful")) return "doubtful";
  if (value.includes("question") || value.includes("day")) return "questionable";
  if (value.includes("probable")) return "available";
  return "unknown";
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export function createEspnProviders(input: { cacheTtlMs: number }): {
  stats: StatsProvider;
  availability: AvailabilityProvider;
} {
  async function athleteId(name: string): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
    const cacheKey = `espn:athlete:${normalizeName(name)}`;
    const cached = providerCache.get<string>(cacheKey);
    if (cached) return { ok: true, id: cached };
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", name);
    url.searchParams.set("limit", "5");
    url.searchParams.set("type", "player");
    const result = await getJson(url.toString());
    if (!result.ok) return result;
    const items = record(result.body)?.items;
    const matches = (Array.isArray(items) ? items : [])
      .map(record)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .filter((item) => item.league === "nba" && item.type === "player" && typeof item.id === "string");
    const target = normalizeName(name);
    const exact = matches.filter((item) => normalizeName(String(item.displayName ?? "")) === target);
    const chosen = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
    if (!chosen) return { ok: false, message: `No ESPN player matched ${name}.` };
    providerCache.set(cacheKey, chosen.id, 24 * 60 * 60 * 1000);
    return { ok: true, id: String(chosen.id) };
  }

  async function injuryIndex(now: string): Promise<DataResult<Record<string, AvailabilityNote | null>>> {
    const cacheKey = "espn:injuries";
    const cached = providerCache.get<Record<string, AvailabilityNote | null>>(cacheKey);
    if (cached) {
      return okResult({ data: cached, fetchedAt: now, source: SOURCE, fictional: false });
    }
    const result = await getJson(INJURY_URL);
    if (!result.ok) return unavailable(SOURCE, result.message);
    const teams = record(result.body)?.injuries;
    const index: Record<string, AvailabilityNote | null> = {};
    for (const team of Array.isArray(teams) ? teams : []) {
      const rows = record(team)?.injuries;
      for (const rowValue of Array.isArray(rows) ? rows : []) {
        const row = record(rowValue);
        const athlete = record(row?.athlete);
        const displayName = typeof athlete?.displayName === "string" ? athlete.displayName : null;
        const statusText = typeof row?.status === "string" ? row.status : "";
        if (!displayName) continue;
        const detail = [statusText, typeof row?.shortComment === "string" ? row.shortComment : null]
          .filter(Boolean)
          .join(". ");
        index[normalizeName(displayName)] = {
          playerId: normalizeName(displayName),
          status: mapInjuryStatus(statusText),
          detail: detail || null,
          source: SOURCE,
          fetchedAt: now,
          sourceUpdatedAt: typeof row?.date === "string" ? row.date : null,
          fictional: false,
        };
      }
    }
    providerCache.set(cacheKey, index, input.cacheTtlMs);
    return okResult({ data: index, fetchedAt: now, source: SOURCE, fictional: false });
  }

  return {
    stats: {
      async getLogs({ players }) {
        const data: Record<string, { logs: GameLog[]; teamName: string | null }> = {};
        const warnings: string[] = [];
        const rows = await mapPool(players, 4, async (player) => {
          const cacheKey = `espn:logs:v2:${normalizeName(player.name)}`;
          const cached = providerCache.get<{ logs: GameLog[]; teamName: string | null }>(cacheKey);
          if (cached) return { player, pack: cached, warning: null as string | null };
          const resolved = await athleteId(player.name);
          if (!resolved.ok) return { player, pack: null, warning: resolved.message };
          const gamelog = await getJson(
            `https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${encodeURIComponent(resolved.id)}/gamelog`,
          );
          if (!gamelog.ok) return { player, pack: null, warning: gamelog.message };
          const logs = logsFromGamelog(gamelog.body);
          const events = record(record(gamelog.body)?.events);
          const newest = logs[0] ? events?.[logs[0].gameId] : null;
          const pack = {
            logs,
            teamName: teamNameFromEvent(newest),
          };
          providerCache.set(cacheKey, pack, input.cacheTtlMs);
          return { player, pack, warning: logs.length === 0 ? `ESPN returned no recent games for ${player.name}.` : null };
        });
        for (const row of rows) {
          if (row.warning) warnings.push(row.warning);
          if (row.pack) data[row.player.id] = row.pack;
        }
        return okResult({
          data,
          fetchedAt: new Date().toISOString(),
          source: SOURCE,
          fictional: false,
          warnings,
        });
      },
    },
    availability: {
      async getAvailability({ players }) {
        const now = new Date().toISOString();
        const index = await injuryIndex(now);
        if (index.status === "unavailable") return index;
        const data: Record<string, AvailabilityNote | null> = {};
        for (const player of players) {
          const note = index.data[normalizeName(player.name)] ?? null;
          data[player.id] = note
            ? { ...note, playerId: player.id }
            : null;
        }
        return okResult({
          data,
          fetchedAt: index.fetchedAt,
          sourceUpdatedAt: index.sourceUpdatedAt,
          source: SOURCE,
          fictional: false,
        });
      },
    },
  };
}
