import { DEFAULT_STAKE, formatMoney, roundMoney, type PersistedState, type SelectionSnapshot } from "@/lib/domain";
import { americanToDecimal } from "@/lib/payout";

export interface BettingRecord {
  wins: number;
  losses: number;
  pushes: number;
  profit: number;
  settledStake: number;
  openStake: number;
  openBets: number;
  summary: string;
}

export function legProfit(stake: number, oddsAmerican: number, status: SelectionSnapshot["settlement"]["status"]): number | null {
  if (status === "won") {
    const decimal = americanToDecimal(oddsAmerican);
    if (decimal == null) return null;
    return roundMoney(stake * (decimal - 1));
  }
  if (status === "lost") return roundMoney(-stake);
  if (status === "pushed" || status === "void") return 0;
  return null;
}

export function bettingRecord(state: Pick<PersistedState, "snapshots" | "slips">): BettingRecord {
  const openIds = new Set(state.slips.flatMap((slip) => slip.selections.map((selection) => selection.snapshotId)));
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let profit = 0;
  let settledStake = 0;
  let openStake = 0;
  let openBets = 0;

  for (const snapshot of state.snapshots) {
    const stake = snapshot.stake ?? DEFAULT_STAKE;
    const status = snapshot.settlement.status;
    if (snapshot.settlement.method === "manual" && (status === "won" || status === "lost" || status === "pushed" || status === "void")) {
      const result = legProfit(stake, snapshot.oddsAmerican, status);
      if (result == null) continue;
      if (status === "won") wins += 1;
      if (status === "lost") losses += 1;
      if (status === "pushed" || status === "void") pushes += 1;
      profit = roundMoney(profit + result);
      if (status === "won" || status === "lost") settledStake = roundMoney(settledStake + stake);
      continue;
    }
    if (status === "pending" && openIds.has(snapshot.id)) {
      openBets += 1;
      openStake = roundMoney(openStake + stake);
    }
  }

  const summary =
    wins + losses + pushes === 0
      ? "Grade a bet won, lost, or pushed in this history. The profit uses the stake saved when the quote was added."
      : `${wins}–${losses}${pushes ? `–${pushes}` : ""} at ${formatMoney(profit)} on ${formatMoney(settledStake)} of settled singles. ${openBets} still open, ${formatMoney(openStake)} staked. This is your record. It does not predict the next bet.`;

  return { wins, losses, pushes, profit, settledStake, openStake, openBets, summary };
}
