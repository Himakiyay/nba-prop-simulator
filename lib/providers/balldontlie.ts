import { z } from "zod";
import {
  normalizeName,
  type AvailabilityNote,
  type AvailabilityStatus,
  type GameLog,
} from "@/lib/domain";
import { providerCache } from "@/lib/providers/cache";
import type { AvailabilityProvider, StatsProvider } from "@/lib/providers/types";
import { parseMinutes } from "@/lib/stats";
import { okResult } from "@/lib/result";

const ROOT = "https://api.balldontlie.io";
const SOURCE = "balldontlie";

const teamSchema = z
  .object({
    id: z.number(),
    full_name: z.string().optional(),
    abbreviation: z.string().optional(),
  })
  .passthrough();

const playerSchema = z
  .object({
    id: z.number(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    team: teamSchema.optional(),
  })
  .passthrough();

const statsSchema = z.object({
  data: z.array(
    z
      .object({
        min: z.string().nullable().optional(),
        pts: z.number().nullable().optional(),
        reb: z.number().nullable().optional(),
        ast: z.number().nullable().optional(),
        fg3m: z.number().nullable().optional(),
        stl: z.number().nullable().optional(),
        blk: z.number().nullable().optional(),
        turnover: z.number().nullable().optional(),
        player: playerSchema.optional(),
        team: teamSchema.optional(),
        game: z
          .object({
            id: z.number(),
            date: z.string().optional(),
            home_team: teamSchema.optional(),
            visitor_team: teamSchema.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  ),
});

const playersSchema = z.object({
  data: z.array(playerSchema),
});

const injurySchema = z.object({
  data: z.array(
    z
      .object({
        player: playerSchema.optional(),
        status: z.string().optional(),
        description: z.string().optional(),
        return_date: z.string().optional(),
      })
      .passthrough(),
  ),
});

async function bdl(
  apiKey: string,
  path: string,
  params: Record<string, string | string[]>,
): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const url = new URL(`${ROOT}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, value);
    }
  }
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Authorization: apiKey },
    });
    if (!response.ok) {
      return { ok: false, message: `BallDontLie returned HTTP ${response.status}.` };
    }
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, message: "The BallDontLie request failed before a response arrived." };
  }
}

function fullName(player: z.infer<typeof playerSchema>): string {
  return `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
}

function mapStatus(status: string | undefined): AvailabilityStatus {
  const value = (status ?? "").toLowerCase();
  if (value.includes("out")) return "out";
  if (value.includes("doubtful")) return "doubtful";
  if (value.includes("questionable")) return "questionable";
  if (value.includes("probable") || value.includes("available") || value.includes("day-to-day")) {
    return "available";
  }
  return "unknown";
}

export function createBallDontLieProviders(input: {
  apiKey: string;
  cacheTtlMs: number;
}): { stats: StatsProvider; availability: AvailabilityProvider } {
  async function resolvePlayer(name: string): Promise<
    | { ok: true; id: number; teamName: string | null }
    | { ok: false; message: string }
  > {
    const cacheKey = `bdl:player:${normalizeName(name)}`;
    const cached = providerCache.get<{ id: number; teamName: string | null }>(cacheKey);
    if (cached) return { ok: true, ...cached };
    const result = await bdl(input.apiKey, "/nba/v1/players", { search: name, per_page: "10" });
    if (!result.ok) return result;
    const parsed = playersSchema.safeParse(result.body);
    if (!parsed.success) return { ok: false, message: "BallDontLie player search did not match the expected shape." };
    const target = normalizeName(name);
    const exact = parsed.data.data.filter((player) => normalizeName(fullName(player)) === target);
    const chosen = exact.length === 1 ? exact[0] : parsed.data.data.length === 1 ? parsed.data.data[0] : null;
    if (!chosen) {
      return {
        ok: false,
        message:
          exact.length > 1
            ? `More than one BallDontLie player matched ${name}, so stats were not attached.`
            : `No BallDontLie player matched ${name}.`,
      };
    }
    const resolved = { id: chosen.id, teamName: chosen.team?.full_name ?? null };
    providerCache.set(cacheKey, resolved, input.cacheTtlMs);
    return { ok: true, ...resolved };
  }

  return {
    stats: {
      async getLogs({ players }) {
        const data: Record<string, { logs: GameLog[]; teamName: string | null }> = {};
        const warnings: string[] = [];
        const start = new Date();
        start.setUTCDate(start.getUTCDate() - 120);
        const startDate = start.toISOString().slice(0, 10);
        for (const player of players) {
          const resolved = await resolvePlayer(player.name);
          if (!resolved.ok) {
            warnings.push(resolved.message);
            continue;
          }
          const cacheKey = `bdl:stats:${resolved.id}:${startDate}`;
          const cached = providerCache.get<GameLog[]>(cacheKey);
          if (cached) {
            data[player.id] = { logs: cached, teamName: resolved.teamName };
            continue;
          }
          const result = await bdl(input.apiKey, "/nba/v1/stats", {
            "player_ids[]": [String(resolved.id)],
            per_page: "25",
            period: "0",
            start_date: startDate,
          });
          if (!result.ok) {
            warnings.push(result.message);
            continue;
          }
          const parsed = statsSchema.safeParse(result.body);
          if (!parsed.success) {
            warnings.push(`Stats for ${player.name} did not match the expected shape.`);
            continue;
          }
          const logs = parsed.data.data
            .filter((row) => row.game?.date)
            .map((row) => {
              const game = row.game!;
              const teamId = row.team?.id;
              const home = game.home_team;
              const away = game.visitor_team;
              const opponent =
                teamId != null && home?.id === teamId
                  ? away?.full_name
                  : teamId != null && away?.id === teamId
                    ? home?.full_name
                    : null;
              const stat = (value: number | null | undefined) =>
                typeof value === "number" ? value : undefined;
              return {
                gameId: String(game.id),
                date: game.date ?? "",
                opponentName: opponent ?? "Opponent not supplied",
                minutes: parseMinutes(row.min),
                stats: {
                  pts: stat(row.pts),
                  reb: stat(row.reb),
                  ast: stat(row.ast),
                  fg3m: stat(row.fg3m),
                  stl: stat(row.stl),
                  blk: stat(row.blk),
                  turnover: stat(row.turnover),
                },
              } satisfies GameLog;
            })
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10);
          providerCache.set(cacheKey, logs, input.cacheTtlMs);
          data[player.id] = { logs, teamName: resolved.teamName };
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
        const data: Record<string, AvailabilityNote | null> = {};
        const warnings: string[] = [];
        const fetchedAt = new Date().toISOString();
        for (const player of players) {
          const resolved = await resolvePlayer(player.name);
          if (!resolved.ok) {
            warnings.push(resolved.message);
            data[player.id] = null;
            continue;
          }
          const cacheKey = `bdl:injury:${resolved.id}`;
          const cached = providerCache.get<{ note: AvailabilityNote | null }>(cacheKey);
          if (cached) {
            data[player.id] = cached.note;
            continue;
          }
          const result = await bdl(input.apiKey, "/nba/v1/player_injuries", {
            "player_ids[]": [String(resolved.id)],
            per_page: "5",
          });
          if (!result.ok) {
            warnings.push(result.message);
            continue;
          }
          const parsed = injurySchema.safeParse(result.body);
          if (!parsed.success) {
            warnings.push(`Injuries for ${player.name} did not match the expected shape.`);
            continue;
          }
          const row = parsed.data.data[0];
          if (!row) {
            providerCache.set(cacheKey, { note: null }, input.cacheTtlMs);
            data[player.id] = null;
            continue;
          }
          const note: AvailabilityNote = {
            playerId: player.id,
            status: mapStatus(row.status),
            detail: [row.status, row.description, row.return_date ? `Return date ${row.return_date}` : null]
              .filter(Boolean)
              .join(". "),
            source: SOURCE,
            fetchedAt,
            sourceUpdatedAt: null,
            fictional: false,
          };
          providerCache.set(cacheKey, { note }, input.cacheTtlMs);
          data[player.id] = note;
        }
        return okResult({
          data,
          fetchedAt,
          source: SOURCE,
          fictional: false,
          warnings,
        });
      },
    },
  };
}
