import { connection } from "next/server";
import { resolveOpponent } from "@/lib/research";
import { createEspnProviders, loadRoleExtras } from "@/lib/providers/espn";
import { readLimits } from "@/lib/providers/create";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  if (name.length < 3 || name.length > 80) {
    return Response.json({ error: "A player name is required." }, { status: 400 });
  }
  const market = url.searchParams.get("market")?.trim() || "player_points";
  const home = url.searchParams.get("home")?.trim() || "";
  const away = url.searchParams.get("away")?.trim() || "";
  const limits = readLimits();
  const espn = createEspnProviders({ cacheTtlMs: limits.statsCacheSeconds * 1000 });
  const player = { id: "lookup", name };
  const [logs, availability] = await Promise.all([
    espn.stats.getLogs({ players: [player] }),
    espn.availability.getAvailability({ players: [player] }),
  ]);
  if (logs.status === "unavailable") {
    return Response.json({ logs: [], teamName: null, availability: null, roleExtras: null, error: logs.message });
  }
  const pack = logs.data.lookup;
  const note = availability.status === "unavailable" ? null : (availability.data.lookup ?? null);
  const teamName = pack?.teamName ?? null;
  const opponentName =
    home && away
      ? resolveOpponent(teamName, { id: "lookup", homeTeamName: home, awayTeamName: away, commenceTime: "" })
      : null;
  let roleExtras = null;
  try {
    roleExtras = await loadRoleExtras({
      playerName: name,
      teamName,
      opponentName,
      marketKey: market,
      cacheTtlMs: limits.statsCacheSeconds * 1000,
    });
  } catch {
    roleExtras = null;
  }
  return Response.json({
    logs: pack?.logs ?? [],
    teamName,
    availability: note,
    availabilityKnown: availability.status !== "unavailable",
    roleExtras,
    error: null,
  });
}
