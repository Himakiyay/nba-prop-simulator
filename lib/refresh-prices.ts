import type { Offer, PersistedState } from "@/lib/domain";
import { applyRetrievedPrices } from "@/lib/state";

export async function refreshStoredPrices(
  state: PersistedState,
  eventIds: string[],
): Promise<{ state: PersistedState; error: string | null }> {
  const ids = [...new Set(eventIds)].filter(Boolean).slice(0, 6);
  if (ids.length === 0) return { state, error: "No games are waiting on a price check." };
  try {
    const response = await fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventIds: ids }),
    });
    const body = (await response.json()) as {
      offers?: Offer[];
      fetchedAt?: string;
      error?: string | null;
    };
    if (!response.ok || body.error) {
      return { state, error: body.error ?? "The price check failed." };
    }
    return {
      state: applyRetrievedPrices(state, body.offers ?? [], body.fetchedAt ?? new Date().toISOString(), ids),
      error: null,
    };
  } catch {
    return { state, error: "The price check could not be completed." };
  }
}
