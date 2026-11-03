import { describe, expect, it } from "vitest";
import { logsFromGamelog, teamNameFromEvent } from "@/lib/providers/espn";

describe("ESPN game logs", () => {
  it("reads points, rebounds, assists, threes, and minutes from a gamelog", () => {
    const logs = logsFromGamelog({
      names: [
        "minutes",
        "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
        "totalRebounds",
        "assists",
        "blocks",
        "steals",
        "turnovers",
        "points",
      ],
      events: {
        "1": {
          gameDate: "2026-11-01T00:00:00.000Z",
          opponent: { displayName: "Brooklyn Nets" },
        },
      },
      seasonTypes: [
        {
          categories: [
            {
              events: [{ eventId: "1", stats: ["34", "4-11", "2", "6", "0", "0", "1", "19"] }],
            },
          ],
        },
      ],
    });
    expect(logs).toHaveLength(1);
    expect(
      teamNameFromEvent({
        team: {
          abbreviation: "NY",
          links: [{ href: "https://www.espn.com/nba/team/_/name/ny/new-york-knicks" }],
        },
      }),
    ).toBe("New York Knicks");
    expect(logs[0]).toMatchObject({
      gameId: "1",
      date: "2026-11-01",
      opponentName: "Brooklyn Nets",
      minutes: 34,
      stats: { pts: 19, reb: 2, ast: 6, fg3m: 4, stl: 0, blk: 0, turnover: 1 },
    });
  });
});
