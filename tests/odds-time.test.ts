import { describe, expect, it } from "vitest";
import { oddsApiTimestamp } from "@/lib/providers/odds-api";

describe("Odds API timestamps", () => {
  it("strips milliseconds so commence filters match the documented format", () => {
    expect(oddsApiTimestamp("2026-11-03T08:54:12.123Z")).toBe("2026-11-03T08:54:12Z");
  });

  it("leaves a whole-second timestamp unchanged", () => {
    expect(oddsApiTimestamp("2026-11-05T00:10:00Z")).toBe("2026-11-05T00:10:00Z");
  });
});
