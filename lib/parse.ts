import {
  blankIntent,
  marketFamily,
  type Intent,
  type Side,
  type Slip,
} from "@/lib/domain";

const INDEX_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
};

function clean(text: string): string {
  return text.replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}

function detectMarket(text: string): string | null {
  const value = text.toLowerCase();
  if (/points?\s*\+\s*rebounds?\s*\+\s*assists?|\bpra\b/.test(value)) {
    return "player_points_rebounds_assists";
  }
  if (/rebounds?/.test(value) && /assists?/.test(value) && !/points?/.test(value)) {
    return "player_rebounds_assists";
  }
  if (/points?/.test(value) && /rebounds?/.test(value) && !/assists?/.test(value)) {
    return "player_points_rebounds";
  }
  if (/points?/.test(value) && /assists?/.test(value) && !/rebounds?/.test(value)) {
    return "player_points_assists";
  }
  if (/blocks?/.test(value) && /steals?/.test(value)) return "player_blocks_steals";
  if (/threes?|3-pointers?|\b3s\b/.test(value)) return "player_threes";
  if (/rebounds?|\brebs?\b/.test(value)) return "player_rebounds";
  if (/assists?/.test(value)) return "player_assists";
  if (/blocks?/.test(value)) return "player_blocks";
  if (/steals?/.test(value)) return "player_steals";
  if (/turnovers?/.test(value)) return "player_turnovers";
  if (/points?/.test(value)) return "player_points";
  return null;
}

function requestedCount(text: string): number {
  const value = text.toLowerCase();
  if (/\b(one|1)[- ]pick\b/.test(value)) return 1;
  if (/\b(two|2)[- ]pick\b/.test(value)) return 2;
  if (/\b(three|3)[- ]pick\b/.test(value)) return 3;
  if (/\b(four|4)[- ]pick\b/.test(value)) return 4;
  if (/\b(five|5)[- ]pick\b/.test(value)) return 5;
  if (/\b(six|6)[- ]pick\b/.test(value)) return 6;
  return 4;
}

function ordinal(text: string, slipLength: number): number | null {
  const match = text
    .toLowerCase()
    .match(/\b(first|second|third|fourth|fifth|sixth|last|\d+(?:st|nd|rd|th)?)\b/);
  if (!match) return null;
  if (match[1] === "last") return slipLength > 0 ? slipLength : null;
  if (INDEX_WORDS[match[1]]) return INDEX_WORDS[match[1]];
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSide(text: string): Side | null {
  const match = text.toLowerCase().match(/\b(over|under)\b/);
  return match ? (match[1] as Side) : null;
}

function parseLine(text: string): number | null {
  const match = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function playerFragment(text: string): string | null {
  const cleaned = text
    .replace(
      /\b(analyze|research|look|at|break|down|grade|compare|versus|vs|the|prop|props|player|over|under|rebound|rebounds|point|points|assist|assists|three|threes|block|blocks|steal|steals|turnover|turnovers|and|this|that)\b/gi,
      " ",
    )
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 3) return null;
  return cleaned;
}

export function parseIntent(message: string, slip: Slip): Intent {
  const text = clean(message);
  const lower = text.toLowerCase();

  if (/uncertain|biggest risk|what could go wrong|weakest part/.test(lower)) {
    return blankIntent("uncertainty");
  }

  if (
    /suggest|four-pick|4-pick|build (me )?a|research tonight|tonight'?s nba|slate/.test(lower)
  ) {
    return { ...blankIntent("suggest"), count: requestedCount(lower) };
  }

  if (/lower (this|the) line|alternate line|drop the line|lower it/.test(lower)) {
    return { ...blankIntent("lower_line"), index: ordinal(lower, slip.selections.length) };
  }

  if (/\breplace\b/.test(lower)) {
    const index = ordinal(lower, slip.selections.length);
    if (index == null) {
      return {
        ...blankIntent("clarify"),
        clarification: "Which selection should I replace? For example, the second one.",
      };
    }
    return { ...blankIntent("replace"), index };
  }

  if (/\b(remove|delete)\b/.test(lower)) {
    const index = ordinal(lower, slip.selections.length);
    if (index == null) {
      return {
        ...blankIntent("clarify"),
        clarification: "Which selection should I remove?",
      };
    }
    return { ...blankIntent("remove"), index };
  }

  const stake = lower.match(/(?:stake|risk|wager)\s*(?:to|of|at)?\s*\$?(\d+(?:\.\d+)?)/);
  if (stake) {
    return { ...blankIntent("set_stake"), stake: Number(stake[1]) };
  }

  if (/\bcompare\b/.test(lower)) {
    return parseCompare(text, slip);
  }

  if (/\badd (it|this|that|the selection|the prop|this prop)\b/.test(lower)) {
    return blankIntent("add_recent");
  }

  if (/what markets|which markets|supported markets/.test(lower)) {
    return blankIntent("list_markets");
  }

  if (/\b(analyze|research|break down|grade|look at)\b/.test(lower)) {
    return {
      ...blankIntent("analyze"),
      player: playerFragment(text),
      market: detectMarket(text),
      side: parseSide(text),
      line: parseLine(text),
    };
  }

  return {
    ...blankIntent("clarify"),
    clarification:
      "I can suggest a paper slip, analyze one prop, compare two props, or edit the current slip. Name the player and market if you have one in mind.",
  };
}

function parseCompare(text: string, slip: Slip): Intent {
  const market = detectMarket(text);
  const parts = text.split(/\band\b|\bvs\.?\b|\bversus\b/i).map((part) => part.trim());
  if (parts.length >= 2) {
    const left = playerFragment(parts[0]);
    const right = playerFragment(parts.slice(1).join(" and "));
    if (left && right) {
      return {
        ...blankIntent("compare"),
        player: left,
        otherPlayer: right,
        market: detectMarket(parts[0]) ?? market,
        otherMarket: detectMarket(parts[1]) ?? market,
        side: parseSide(parts[0]) ?? parseSide(text),
        otherSide: parseSide(parts[1]) ?? parseSide(text),
        line: parseLine(parts[0]),
        otherLine: parseLine(parts[1]),
      };
    }
  }

  const pool = market
    ? slip.selections.filter((selection) => marketFamily(selection.marketKey) === market)
    : slip.selections;
  if (pool.length === 2) {
    return {
      ...blankIntent("compare"),
      player: pool[0].playerName,
      otherPlayer: pool[1].playerName,
      market: marketFamily(pool[0].marketKey),
      otherMarket: marketFamily(pool[1].marketKey),
      side: pool[0].side,
      otherSide: pool[1].side,
      line: pool[0].line,
      otherLine: pool[1].line,
    };
  }
  return {
    ...blankIntent("clarify"),
    clarification:
      "Name the two props to compare, or keep exactly two matching selections on the slip.",
  };
}
