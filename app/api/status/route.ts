import { connection } from "next/server";
import { BASELINE_MODEL_VERSION, MESSAGE_CHAR_LIMIT } from "@/lib/domain";
import { providerStatus, readLimits } from "@/lib/providers/create";

export async function GET() {
  await connection();
  const limits = readLimits();
  return Response.json({
    ...providerStatus(),
    modelVersion: BASELINE_MODEL_VERSION,
    limits: {
      messageChars: MESSAGE_CHAR_LIMIT,
      chatPerMinute: limits.chatPerMinute,
      slateEventLimit: limits.slateEventLimit,
      lookupEventLimit: limits.lookupEventLimit,
    },
    notes: [
      "Request throttling is per server instance, not a global quota.",
      "Demo fixtures are never substituted into a live response.",
      "BallDontLie is the live stats and injury source when BALLDONTLIE_API_KEY is set. The Odds API is the live odds source.",
    ],
  });
}
