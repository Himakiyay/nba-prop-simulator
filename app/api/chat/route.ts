import { connection } from "next/server";
import { handleTurn } from "@/lib/handle-turn";
import { allowRequest } from "@/lib/providers/cache";
import { createProviders, readLimits } from "@/lib/providers/create";
import { chatRequestSchema } from "@/lib/schema";

export async function POST(request: Request) {
  await connection();
  const limits = readLimits();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowRequest(`chat:${ip}`, limits.chatPerMinute, 60_000)) {
    return Response.json(
      {
        error: `Too many research requests. This server instance allows ${limits.chatPerMinute} per minute, and the limit is not shared across instances.`,
      },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request JSON could not be read." }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "The message or paper slip did not match the expected shape." },
      { status: 400 },
    );
  }
  try {
    const turn = await handleTurn(
      {
        mode: parsed.data.mode,
        message: parsed.data.message,
        slip: parsed.data.slip,
        now: new Date().toISOString(),
        recentOffers: parsed.data.recentOffers,
        limits,
      },
      createProviders(parsed.data.mode),
    );
    return Response.json(turn);
  } catch {
    return Response.json(
      { error: "The research request failed before a result was ready." },
      { status: 500 },
    );
  }
}
