import { connection } from "next/server";
import { createEspnProviders } from "@/lib/providers/espn";
import { readLimits } from "@/lib/providers/create";

export async function GET(request: Request) {
  await connection();
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (name.length < 3 || name.length > 80) {
    return Response.json({ error: "A player name is required." }, { status: 400 });
  }
  const limits = readLimits();
  const espn = createEspnProviders({ cacheTtlMs: limits.statsCacheSeconds * 1000 });
  const player = { id: "lookup", name };
  const [logs, availability] = await Promise.all([
    espn.stats.getLogs({ players: [player] }),
    espn.availability.getAvailability({ players: [player] }),
  ]);
  if (logs.status === "unavailable") {
    return Response.json({ logs: [], teamName: null, availability: null, error: logs.message });
  }
  const pack = logs.data.lookup;
  const note = availability.status === "unavailable" ? null : (availability.data.lookup ?? null);
  return Response.json({
    logs: pack?.logs ?? [],
    teamName: pack?.teamName ?? null,
    availability: note,
    availabilityKnown: availability.status !== "unavailable",
    error: null,
  });
}
