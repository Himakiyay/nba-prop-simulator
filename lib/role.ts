import { marketLabel, normalizeName, type GameLog, type RoleRead } from "@/lib/domain";
import { statFromLog } from "@/lib/stats";

export interface SeasonOpponentSplit {
  games: number;
  perGame: number;
}

export function buildRoleRead(input: {
  logs: GameLog[];
  marketKey: string;
  line: number;
  opponentName: string | null;
  position?: string | null;
  teammatesOut?: string[];
  seasonOpponent?: SeasonOpponentSplit | null;
}): RoleRead {
  const label = marketLabel(input.marketKey).toLowerCase();
  const teammatesOut = (input.teammatesOut ?? []).slice(0, 4);
  const played = input.logs
    .map((log) => ({ log, value: statFromLog(input.marketKey, log.stats) }))
    .filter((row): row is { log: GameLog; value: number } => row.value != null);
  if (played.length === 0) {
    const teammates = teammatesOut.length ? ` Listed out on the team: ${teammatesOut.join(", ")}.` : "";
    return {
      placement: "unknown",
      teammatesOut,
      summary: `No recent ${label} log was returned, so minutes and a per-minute rate are unavailable.${teammates}`,
    };
  }

  const values = played.map((row) => row.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const placement = input.line >= low && input.line <= high ? "inside" : "outside";
  const withMinutes = played.filter((row) => row.log.minutes != null && row.log.minutes > 0);
  const minuteTotal = withMinutes.reduce((sum, row) => sum + (row.log.minutes ?? 0), 0);
  const statTotal = withMinutes.reduce((sum, row) => sum + row.value, 0);
  const averageMinutes = withMinutes.length ? minuteTotal / withMinutes.length : null;
  const perMinute = minuteTotal > 0 ? statTotal / minuteTotal : null;
  const applied = averageMinutes != null && perMinute != null ? perMinute * averageMinutes : null;

  const minuteSentence =
    averageMinutes == null
      ? "Minutes were missing on the logged games."
      : `Recent games with a minute total averaged ${averageMinutes.toFixed(1)} minutes over ${withMinutes.length}.`;
  const rateSentence =
    perMinute == null || applied == null
      ? ""
      : ` ${perMinute.toFixed(2)} ${label} per minute is about ${applied.toFixed(1)} ${label} at that minute average.`;
  const rangeSentence = ` Those games ran from ${trimNumber(low)} to ${trimNumber(high)}, and ${trimNumber(input.line)} sits ${placement} that range.`;

  const opponent = input.opponentName;
  const versusLogs = opponent
    ? played.filter((row) => namesMatch(row.log.opponentName, opponent))
    : [];
  let opponentSentence = "";
  if (input.seasonOpponent && opponent && input.seasonOpponent.games > 0) {
    opponentSentence = ` Season split against the ${shortTeam(opponent)}: ${trimNumber(input.seasonOpponent.perGame)} ${label} per game across ${input.seasonOpponent.games} game${input.seasonOpponent.games === 1 ? "" : "s"}.`;
  } else if (versusLogs.length && opponent) {
    opponentSentence = ` The log has ${versusLogs.length} game${versusLogs.length === 1 ? "" : "s"} against the ${shortTeam(opponent)} at ${versusLogs.map((row) => trimNumber(row.value)).join(", ")}.`;
  } else if (opponent) {
    opponentSentence = ` The log has no game against the ${shortTeam(opponent)}.`;
  }
  const position = input.position ? ` Listed position: ${input.position.toLowerCase()}.` : "";
  const defense = input.position
    ? ` What that defense allows to a ${input.position.toLowerCase()} is not in this feed, so the opponent figure is this player's own production.`
    : "";
  const teammates = teammatesOut.length ? ` Listed out on the team: ${teammatesOut.join(", ")}.` : "";

  return {
    placement,
    teammatesOut,
    summary: `${minuteSentence}${rateSentence}${rangeSentence}${opponentSentence}${position}${defense}${teammates}`,
  };
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function shortTeam(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return parts.at(-1) ?? name;
}

function namesMatch(left: string, right: string): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}
