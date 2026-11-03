import {
  marketFamily,
  marketLabel,
  MESSAGE_CHAR_LIMIT,
  normalizeName,
  SUGGEST_MARKETS,
  SUPPORTED_MARKETS,
  uniqueBy,
  type AppMode,
  type AvailabilityState,
  type GameLog,
  type Offer,
  type ResearchCard,
  type Slip,
  type SlipSelection,
  type SourceStamp,
  type SportEvent,
} from "@/lib/domain";
import { parseIntent } from "@/lib/parse";
import {
  narrateAnalyze,
  narrateCompare,
  narrateMarkets,
  narrateSuggest,
  narrateUncertainty,
  narrativeAllowed,
  summaryMatchesRecords,
} from "@/lib/narrate";
import { readLimits } from "@/lib/providers/create";
import { loadRoleExtras } from "@/lib/providers/espn";
import type { ProviderSet } from "@/lib/providers/types";
import { buildRoleRead } from "@/lib/role";
import {
  buildResearchCard,
  capCandidates,
  preferBook,
  preferBookPerEvent,
  suggestFromCards,
} from "@/lib/research";
import type { DataResult } from "@/lib/result";
import {
  addSelection,
  alternatesFor,
  removeSelection,
  replaceSelection,
  selectionByIndex,
  setStake,
} from "@/lib/slip";
import type { TurnInput, TurnResult } from "@/lib/turn";
import { explainUncertainty } from "@/lib/uncertainty";

interface Hydrated {
  logs: Record<string, { logs: GameLog[]; teamName: string | null }>;
  availability: Record<string, ResearchCard["availability"] | null>;
  availabilityKnown: boolean;
  statsSource: SourceStamp | null;
  availabilitySource: SourceStamp | null;
  warnings: string[];
}

export async function handleTurn(input: TurnInput, providers: ProviderSet): Promise<TurnResult> {
  const message = input.message.trim();
  if (!message) {
    return finish(input, {
      narrative: "Write a research question to start.",
      clarification: "Write a research question to start.",
    });
  }
  if (message.length > MESSAGE_CHAR_LIMIT) {
    return finish(input, {
      narrative: `Keep a request under ${MESSAGE_CHAR_LIMIT} characters.`,
      warnings: [`Requests are limited to ${MESSAGE_CHAR_LIMIT} characters.`],
    });
  }

  const resolved = await resolveIntent(input, providers);
  const intent = resolved.intent;
  const warnings = [...resolved.warnings];

  if (intent.type === "clarify") {
    return finish(input, {
      narrative: intent.clarification ?? "I need a more specific request.",
      clarification: intent.clarification,
      warnings,
    });
  }
  if (intent.type === "list_markets") {
    return finish(input, { narrative: narrateMarkets(), warnings, narrator: "template" });
  }
  if (intent.type === "uncertainty") {
    const uncertainty = explainUncertainty(input.slip);
    return finish(input, {
      narrative: narrateUncertainty(uncertainty),
      uncertainty,
      warnings,
    });
  }
  if (intent.type === "set_stake") {
    const edit = setStake(input.slip, intent.stake ?? Number.NaN, input.now);
    if (!edit.ok) {
      return finish(input, {
        narrative: edit.reason,
        warnings,
        rejected: [{ action: "set_stake", reason: edit.reason }],
      });
    }
    return finish(input, {
      narrative: `Paper stake set to ${edit.slip.stake.toFixed(2)}. Nothing is wagered.`,
      slip: edit.slip,
      warnings,
    });
  }
  if (intent.type === "remove") {
    const selection = selectionByIndex(input.slip, intent.index);
    if (!selection) {
      return finish(input, {
        narrative: "That selection number is not on the slip.",
        clarification: "That selection number is not on the slip.",
        warnings,
      });
    }
    const edit = removeSelection(input.slip, selection.id, input.now);
    if (!edit.ok) {
      return finish(input, {
        narrative: edit.reason,
        rejected: [{ action: "remove", reason: edit.reason }],
        warnings,
      });
    }
    return finish(input, {
      narrative: `Removed ${selection.playerName} ${selection.side} ${selection.line} ${selection.marketLabel}. The original snapshot stays in the history.`,
      slip: edit.slip,
      warnings,
      followUps: ["Explain the biggest uncertainty in this slip."],
    });
  }

  const board = await loadBoard(input, providers, intent);
  warnings.push(...board.warnings);
  if (board.blocked) {
    return finish(input, { narrative: board.blocked, warnings, cards: [] });
  }
  if (!board.pack || (board.unavailable && board.pack.offers.length === 0 && intent.type !== "lower_line")) {
    return finish(input, {
      narrative: board.unavailable ?? board.blocked ?? "Odds are unavailable.",
      warnings,
    });
  }
  if (board.unavailable) warnings.push(board.unavailable);

  const catalog = board.pack.offers;
  const offers = preferBookPerEvent(catalog, providers.preferredBookmaker);
  const events = new Map(board.pack.events.map((event) => [event.id, event]));

  if (intent.type === "suggest" || intent.type === "apply_proposal") {
    return suggest(
      input,
      providers,
      offers,
      catalog,
      events,
      warnings,
      intent.type === "apply_proposal",
      intent.count ?? 4,
    );
  }
  if (intent.type === "analyze") {
    return analyze(input, providers, offers, catalog, events, warnings, intent);
  }
  if (intent.type === "compare") {
    return compare(input, providers, offers, catalog, events, warnings, intent);
  }
  if (intent.type === "add_recent") {
    return addRecent(input, providers, offers, catalog, events, warnings);
  }
  if (intent.type === "lower_line") {
    return lowerLine(input, providers, offers, catalog, events, warnings, intent.index);
  }
  if (intent.type === "replace") {
    return replaceIndexed(input, providers, offers, catalog, events, warnings, intent.index);
  }
  return finish(input, {
    narrative: "I could not map that request to a research action.",
    clarification: "Try a suggestion, a named prop, or a slip edit.",
    warnings,
  });
}

async function resolveIntent(input: TurnInput, providers: ProviderSet) {
  const warnings: string[] = [];
  if (/replace the (current )?(slip|slate) with (this|the) proposal/i.test(input.message)) {
    return { intent: { ...parseIntent("suggest a four-pick slip", input.slip), type: "apply_proposal" as const }, warnings };
  }
  if (input.mode === "live" && providers.language.configured) {
    const classified = await providers.language.classify({
      message: input.message,
      slipSummary: summarizeSlip(input.slip),
    });
    if (classified.status !== "unavailable") {
      return { intent: classified.data, warnings };
    }
    warnings.push(`${classified.message} Used the command parser instead.`);
  }
  return { intent: parseIntent(input.message, input.slip), warnings };
}

async function loadBoard(
  input: TurnInput,
  providers: ProviderSet,
  intent: TurnInput extends never ? never : ReturnType<typeof parseIntent>,
): Promise<{
  pack: { events: SportEvent[]; offers: Offer[] } | null;
  warnings: string[];
  blocked: string | null;
  unavailable: string | null;
}> {
  const warnings: string[] = [];
  const window = timeWindow(input.now);
  let eventIds: string[] = [];
  let markets: string[] = [...SUGGEST_MARKETS];
  let includeAlternates = false;
  let limit = input.limits.slateEventLimit;

  if (intent.type === "analyze" || intent.type === "compare") {
    limit = input.limits.lookupEventLimit;
    includeAlternates = true;
    const requested = [intent.market, intent.otherMarket].filter((market): market is string =>
      Boolean(market && SUPPORTED_MARKETS.includes(marketFamily(market) as (typeof SUPPORTED_MARKETS)[number])),
    );
    if (requested.length) markets = requested.map((market) => marketFamily(market));
  }
  if (intent.type === "lower_line" || intent.type === "replace" || intent.type === "add_recent" || intent.type === "apply_proposal") {
    includeAlternates = intent.type !== "replace";
    const fromSlip = input.slip.selections.map((selection) => marketFamily(selection.marketKey));
    const fromRecent = input.recentOffers.map((offer) => marketFamily(offer.marketKey));
    const combined = [...new Set([...fromSlip, ...fromRecent, ...SUGGEST_MARKETS])];
    markets = combined;
  }

  if (intent.type === "add_recent" || intent.type === "apply_proposal") {
    eventIds = [...new Set(input.recentOffers.map((offer) => offer.eventId))];
  }
  if (intent.type === "lower_line") {
    const selection = targeted(input.slip, intent.index);
    eventIds = selection ? [selection.eventId] : [];
    markets = selection ? [marketFamily(selection.marketKey)] : markets;
  }

  if (eventIds.length === 0) {
    const listed = await providers.odds.listEvents({ ...window, limit });
    const mismatch = guard(input.mode, listed, "events");
    if (mismatch) return { pack: null, warnings, blocked: mismatch, unavailable: null };
    if (listed.status === "unavailable") {
      return { pack: null, warnings, blocked: null, unavailable: listed.message };
    }
    if (listed.message) warnings.push(listed.message);
    warnings.push(...listed.warnings);
    eventIds = listed.data.map((event) => event.id);
    if (eventIds.length === 0) {
      return {
        pack: null,
        warnings,
        blocked: null,
        unavailable: "No events were returned for the current window.",
      };
    }
  }

  const offered = await providers.odds.listOffers({ eventIds, markets, includeAlternates });
  const offeredMismatch = guard(input.mode, offered, "odds");
  if (offeredMismatch) return { pack: null, warnings, blocked: offeredMismatch, unavailable: null };
  if (offered.status === "unavailable") {
    return { pack: { events: [], offers: [] }, warnings, blocked: null, unavailable: offered.message };
  }
  if (offered.message) warnings.push(offered.message);
  warnings.push(...offered.warnings);
  return { pack: offered.data, warnings, blocked: null, unavailable: null };
}

function timeWindow(now: string) {
  const stamp = new Date(now).getTime();
  const base = Number.isNaN(stamp) ? Date.now() : stamp;
  return {
    fromIso: new Date(base - 3 * 60 * 60 * 1000).toISOString(),
    toIso: new Date(base + 36 * 60 * 60 * 1000).toISOString(),
  };
}

function guard<T>(mode: AppMode, result: DataResult<T>, label: string): string | null {
  if (result.status === "unavailable") return null;
  if (mode === "live" && result.fictional) {
    return `Blocked fictional ${label} while live mode is on.`;
  }
  if (mode === "demo" && !result.fictional) {
    return `Demo mode refused non-demo ${label}.`;
  }
  return null;
}

async function hydrate(
  input: TurnInput,
  providers: ProviderSet,
  players: { id: string; name: string }[],
): Promise<Hydrated> {
  const unique = uniqueBy(players, (player) => player.id).slice(0, input.limits.candidatePlayerCap);
  const warnings: string[] = [];
  if (unique.length === 0) {
    return {
      logs: {},
      availability: {},
      availabilityKnown: false,
      statsSource: null,
      availabilitySource: null,
      warnings,
    };
  }
  const stats = await providers.stats.getLogs({ players: unique });
  const availability = await providers.availability.getAvailability({ players: unique });
  const statsBlock = guard(input.mode, stats, "stats");
  const availabilityBlock = guard(input.mode, availability, "availability");
  if (statsBlock) warnings.push(statsBlock);
  if (availabilityBlock) warnings.push(availabilityBlock);
  if (stats.status === "unavailable") warnings.push(stats.message);
  else if (!statsBlock) warnings.push(...stats.warnings);
  if (availability.status === "unavailable") warnings.push(availability.message);
  else if (!availabilityBlock) warnings.push(...availability.warnings);
  const statsReady = stats.status !== "unavailable" && !statsBlock ? stats : null;
  const availabilityReady =
    availability.status !== "unavailable" && !availabilityBlock ? availability : null;
  return {
    logs: statsReady?.data ?? {},
    availability: availabilityReady?.data ?? {},
    availabilityKnown: availabilityReady != null,
    statsSource: statsReady
      ? {
          source: statsReady.source,
          fetchedAt: statsReady.fetchedAt,
          sourceUpdatedAt: statsReady.sourceUpdatedAt,
          stale: statsReady.stale,
          fictional: statsReady.fictional,
        }
      : null,
    availabilitySource: availabilityReady
      ? {
          source: availabilityReady.source,
          fetchedAt: availabilityReady.fetchedAt,
          sourceUpdatedAt: availabilityReady.sourceUpdatedAt,
          stale: availabilityReady.stale,
          fictional: availabilityReady.fictional,
        }
      : null,
    warnings,
  };
}

function toCard(
  offer: Offer,
  events: Map<string, SportEvent>,
  hydrated: Hydrated,
  offers: Offer[],
  catalog: Offer[],
): ResearchCard | null {
  const event = events.get(offer.eventId);
  if (!event) return null;
  const bundle = hydrated.logs[offer.playerId];
  const note = hydrated.availabilityKnown ? hydrated.availability[offer.playerId] : undefined;
  let availabilityState: AvailabilityState = "unavailable";
  if (!hydrated.availabilityKnown || note === undefined) availabilityState = "unavailable";
  else if (note == null) availabilityState = "not_listed";
  else availabilityState = "present";
  const card = buildResearchCard({
    offer,
    event,
    logs: bundle?.logs ?? [],
    teamName: bundle?.teamName ?? null,
    availability: note ?? null,
    availabilityState,
    statsSource: hydrated.statsSource,
    availabilitySource: hydrated.availabilitySource,
    catalog,
  });
  return { ...card, quotedLines: alternatesFor(offer, offers) };
}

async function cardsFor(
  input: TurnInput,
  providers: ProviderSet,
  offers: Offer[],
  events: Map<string, SportEvent>,
  catalog: Offer[] = offers,
): Promise<{ cards: ResearchCard[]; warnings: string[] }> {
  const hydrated = await hydrate(
    input,
    providers,
    offers.map((offer) => ({ id: offer.playerId, name: offer.playerName })),
  );
  const cards = offers
    .map((offer) => toCard(offer, events, hydrated, offers, catalog))
    .filter((card): card is ResearchCard => card != null);
  return { cards, warnings: hydrated.warnings };
}

async function withLiveRole(mode: AppMode, cards: ResearchCard[]): Promise<ResearchCard[]> {
  if (mode !== "live" || cards.length === 0) return cards;
  const cacheTtlMs = readLimits().statsCacheSeconds * 1000;
  return Promise.all(
    cards.map(async (card) => {
      try {
        const extras = await loadRoleExtras({
          playerName: card.offer.playerName,
          teamName: card.teamName,
          opponentName: card.opponentName,
          marketKey: card.offer.marketKey,
          cacheTtlMs,
        });
        return {
          ...card,
          role: buildRoleRead({
            logs: card.logs,
            marketKey: card.offer.marketKey,
            line: card.offer.line,
            opponentName: card.opponentName,
            position: extras.position,
            teammatesOut: extras.teammatesOut,
            seasonOpponent: extras.seasonOpponent,
          }),
        };
      } catch {
        return card;
      }
    }),
  );
}

function playerChoices(name: string): string {
  return `Research ${name}'s prop for today`;
}

function matchPlayers(query: string, offers: Offer[]) {
  const players = uniqueBy(
    offers.map((offer) => ({ id: offer.playerId, name: offer.playerName })),
    (player) => player.id,
  );
  const needle = normalizeName(query);
  const tokens = needle.split(" ").filter((token) => token.length >= 3);
  const exact = players.filter((player) => normalizeName(player.name) === needle);
  if (exact.length) return exact;
  const partial = players.filter((player) => {
    const name = normalizeName(player.name);
    if (name.includes(needle) || needle.includes(name)) return true;
    return tokens.length > 0 && tokens.every((token) => name.includes(token));
  });
  return partial;
}

function findOffer(
  offers: Offer[],
  query: { player: string | null; market: string | null; side: "over" | "under" | null; line: number | null },
  slip: Slip,
  preferred: string | null,
): {
  offer: Offer | null;
  clarification: string | null;
  assumedSide: boolean;
  assumedMarket: boolean;
  options: string[];
} {
  let player = query.player;
  if (!player) {
    const names = uniqueBy(slip.selections, (selection) => selection.playerId);
    if (names.length === 1) player = names[0].playerName;
    else {
      return {
        offer: null,
        clarification: "Which player should I look up?",
        assumedSide: false,
        assumedMarket: false,
        options: ["Best slate for today"],
      };
    }
  }
  const matched = matchPlayers(player, offers);
  if (matched.length === 0) {
    return {
      offer: null,
      clarification: `No quoted player matches ${player} in the games just retrieved.`,
      assumedSide: false,
      assumedMarket: false,
      options: ["Best slate for today"],
    };
  }
  if (matched.length > 1) {
    const names = matched.slice(0, 6).map((item) => item.name);
    return {
      offer: null,
      clarification: `Which player did you mean: ${names.join(", ")}?`,
      assumedSide: false,
      assumedMarket: false,
      options: names.map((name) => playerChoices(name)),
    };
  }
  let pool = offers.filter((offer) => offer.playerId === matched[0].id);
  let assumedMarket = query.market == null;
  if (query.market) {
    pool = pool.filter((offer) => marketFamily(offer.marketKey) === marketFamily(query.market!));
    assumedMarket = false;
  } else {
    const points = pool.filter((offer) => marketFamily(offer.marketKey) === "player_points");
    if (points.length > 0) pool = points;
  }
  const assumedSide = query.side == null;
  const side = query.side ?? "over";
  pool = pool.filter((offer) => offer.side === side);
  if (query.line != null) {
    const exact = pool.filter((offer) => Math.abs(offer.line - query.line!) < 0.01);
    if (exact.length === 0) {
      const lines = [...new Set(pool.map((offer) => offer.line))].sort((a, b) => a - b);
      return {
        offer: null,
        clarification: lines.length
          ? `${query.line} was not in the retrieved ${side} lines for ${matched[0].name}. Available lines: ${lines.join(", ")}.`
          : `No ${side} quote was retrieved for ${matched[0].name}.`,
        assumedSide,
        assumedMarket,
        options: lines.map(
          (line) =>
            `Research ${matched[0].name} ${side} ${line} ${marketLabel(pool[0]?.marketKey ?? "player_points").toLowerCase()} for today`,
        ),
      };
    }
    pool = exact;
  } else {
    const main = pool.filter((offer) => !offer.alternate);
    if (main.length) pool = main;
  }
  pool = preferBook(pool, preferred);
  const lines = [...new Set(pool.map((offer) => offer.line))];
  if (lines.length > 1) {
    return {
      offer: null,
      clarification: `Which line for ${matched[0].name}?`,
      assumedSide,
      assumedMarket,
      options: lines
        .sort((a, b) => a - b)
        .map(
          (line) =>
            `Research ${matched[0].name} ${side} ${line} ${marketLabel(pool[0].marketKey).toLowerCase()} for today`,
        ),
    };
  }
  if (!pool[0]) {
    return {
      offer: null,
      clarification: `No matching quote was retrieved for ${matched[0].name}.`,
      assumedSide,
      assumedMarket,
      options: ["points", "rebounds", "assists"].map(
        (market) => `Research ${matched[0].name}'s ${market} for today`,
      ),
    };
  }
  return { offer: pool[0], clarification: null, assumedSide, assumedMarket, options: [] };
}

async function analyze(
  input: TurnInput,
  providers: ProviderSet,
  offers: Offer[],
  catalog: Offer[],
  events: Map<string, SportEvent>,
  warnings: string[],
  intent: ReturnType<typeof parseIntent>,
): Promise<TurnResult> {
  const found = findOffer(offers, intent, input.slip, providers.preferredBookmaker);
  if (!found.offer || found.clarification) {
    return finish(input, {
      narrative: found.clarification ?? "No quote matched.",
      clarification: found.clarification,
      warnings,
      followUps: found.options,
    });
  }
  const built = await cardsFor(input, providers, related(offers, found.offer), events, catalog);
  const matched = built.cards.find((item) => item.offer.id === found.offer!.id) ?? built.cards[0];
  if (!matched) return finish(input, { narrative: "The quote was missing its event, so I did not invent one.", warnings });
  const card = (await withLiveRole(input.mode, [matched]))[0] ?? matched;
  const told = await maybeNarrate(
    input,
    providers,
    narrateAnalyze(card, found.assumedSide, found.assumedMarket),
    [card],
    warnings,
  );
  let slip = input.slip;
  const snapshots = [];
  let narrative = told.narrative;
  if (intent.offerId === "add") {
    const edit = addSelection(slip, card, alternatesFor(card.offer, offers), input.now);
    if (!edit.ok) {
      narrative = `${edit.reason} ${narrative}`;
    } else {
      slip = edit.slip;
      if (edit.snapshot) snapshots.push(edit.snapshot);
      narrative = `Added ${card.offer.playerName} to the slate. ${narrative}`;
    }
  }
  const currentMarket = marketLabel(card.offer.marketKey).toLowerCase();
  return finish(input, {
    narrative,
    narrator: told.narrator,
    cards: [card],
    slip,
    snapshots,
    warnings: [...warnings, ...built.warnings],
    followUps: [
      `Add ${card.offer.playerName} to the slate`,
      ...["points", "rebounds", "assists"]
        .filter((market) => market !== currentMarket)
        .map((market) => `Research ${card.offer.playerName}'s ${market} for today`),
      "Best slate for today",
    ],
  });
}

function related(offers: Offer[], offer: Offer): Offer[] {
  return offers.filter(
    (candidate) =>
      candidate.playerId === offer.playerId &&
      candidate.eventId === offer.eventId &&
      marketFamily(candidate.marketKey) === marketFamily(offer.marketKey) &&
      candidate.side === offer.side,
  );
}

async function compare(
  input: TurnInput,
  providers: ProviderSet,
  offers: Offer[],
  catalog: Offer[],
  events: Map<string, SportEvent>,
  warnings: string[],
  intent: ReturnType<typeof parseIntent>,
): Promise<TurnResult> {
  const left = findOffer(
    offers,
    { player: intent.player, market: intent.market, side: intent.side, line: intent.line },
    input.slip,
    providers.preferredBookmaker,
  );
  const right = findOffer(
    offers,
    {
      player: intent.otherPlayer,
      market: intent.otherMarket,
      side: intent.otherSide,
      line: intent.otherLine,
    },
    input.slip,
    providers.preferredBookmaker,
  );
  const clarification = left.clarification ?? right.clarification;
  if (!left.offer || !right.offer || clarification) {
    return finish(input, {
      narrative: clarification ?? "I need two retrieved props to compare.",
      clarification,
      warnings,
    });
  }
  const built = await cardsFor(
    input,
    providers,
    uniqueBy([...related(offers, left.offer), ...related(offers, right.offer)], (offer) => offer.id),
    events,
    catalog,
  );
  const matched = [left.offer.id, right.offer.id]
    .map((id) => built.cards.find((card) => card.offer.id === id))
    .filter((card): card is ResearchCard => Boolean(card));
  const cards = await withLiveRole(input.mode, matched);
  if (cards.length < 2) {
    return finish(input, { narrative: "One of the comparison quotes was missing an event.", warnings });
  }
  const told = await maybeNarrate(input, providers, narrateCompare(cards[0], cards[1]), cards, warnings);
  return finish(input, {
    narrative: told.narrative,
    narrator: told.narrator,
    cards,
    warnings: [...warnings, ...built.warnings],
  });
}

async function suggest(
  input: TurnInput,
  providers: ProviderSet,
  offers: Offer[],
  catalog: Offer[],
  events: Map<string, SportEvent>,
  warnings: string[],
  applyProposal: boolean,
  count: number,
): Promise<TurnResult> {
  let sourceOffers = offers.filter(
    (offer) => !offer.alternate && offer.side === "over" && SUGGEST_MARKETS.includes(marketFamily(offer.marketKey) as (typeof SUGGEST_MARKETS)[number]),
  );
  if (applyProposal) {
    const ids = new Set(input.recentOffers.map((offer) => offer.offerId));
    const chosen = offers.filter((offer) => ids.has(offer.id));
    if (chosen.length === 0) {
      return finish(input, {
        narrative: "The proposal quotes were not in the latest odds response, so the slip was left unchanged.",
        warnings,
      });
    }
    sourceOffers = chosen;
  }
  const limited = capCandidates(sourceOffers, input.limits.candidatePlayerCap);
  const built = await cardsFor(input, providers, limited, events, catalog);
  const suggestion = suggestFromCards(built.cards, applyProposal ? built.cards.length : count);
  const chosen = await withLiveRole(input.mode, applyProposal ? built.cards : suggestion.chosen);
  const visible =
    chosen.length > 0
      ? chosen
      : [...built.cards]
          .sort((a, b) => b.baseline.score - a.baseline.score)
          .slice(0, count);
  let slip = input.slip;
  const snapshots = [];
  let applied = false;
  const rejected: TurnResult["rejected"] = [];
  const canApply = applyProposal || input.slip.selections.length === 0;
  if (canApply) {
    if (applyProposal) {
      slip = { ...slip, selections: [], updatedAt: input.now };
    }
    for (const card of chosen) {
      const edit = addSelection(slip, card, alternatesFor(card.offer, offers), input.now);
      if (!edit.ok) {
        rejected.push({ action: "add_selection", reason: edit.reason });
        continue;
      }
      slip = edit.slip;
      if (edit.snapshot) snapshots.push(edit.snapshot);
      applied = true;
    }
  }
  const limitations = suggestion.limitations;
  const told = await maybeNarrate(
    input,
    providers,
    narrateSuggest({
      chosen,
      requested: applyProposal ? chosen.length : count,
      applied: applied && canApply,
      limitations,
    }),
    chosen,
    warnings,
  );
  return finish(input, {
    narrative: told.narrative,
    narrator: told.narrator,
    cards: visible,
    slip,
    snapshots,
    warnings: [...warnings, ...built.warnings],
    rejected,
    proposalApplied: applied && canApply,
    followUps: [
      ...chosen.slice(0, 3).map((card) => `Research ${card.offer.playerName}'s prop for today`),
      canApply ? "Explain the biggest uncertainty in this slate." : "Replace the slate with this proposal",
    ],
  });
}

async function addRecent(
  input: TurnInput,
  providers: ProviderSet,
  offers: Offer[],
  catalog: Offer[],
  events: Map<string, SportEvent>,
  warnings: string[],
): Promise<TurnResult> {
  if (input.recentOffers.length === 0) {
    return finish(input, {
      narrative: "Quote a prop first, then ask me to add it.",
      clarification: "Quote a prop first, then ask me to add it.",
      warnings,
    });
  }
  if (input.recentOffers.length > 1) {
    return finish(input, {
      narrative: "More than one quote is in context. Name the player to add.",
      clarification: "More than one quote is in context. Name the player to add.",
      warnings,
    });
  }
  const offer = offers.find((item) => item.id === input.recentOffers[0].offerId);
  if (!offer) {
    return finish(input, {
      narrative: "That offer was not in the latest odds response, so I did not add it.",
      warnings,
    });
  }
  const built = await cardsFor(input, providers, related(offers, offer), events, catalog);
  const matched = built.cards.find((item) => item.offer.id === offer.id);
  if (!matched) return finish(input, { narrative: "The offer was missing its event.", warnings });
  const card = (await withLiveRole(input.mode, [matched]))[0] ?? matched;
  const edit = addSelection(input.slip, card, alternatesFor(offer, offers), input.now);
  if (!edit.ok) {
    return finish(input, {
      narrative: edit.reason,
      cards: [card],
      rejected: [{ action: "add_selection", reason: edit.reason }],
      warnings: [...warnings, ...built.warnings],
    });
  }
  return finish(input, {
    narrative: `Added ${card.offer.playerName} ${card.offer.side} ${card.offer.line} ${marketLabel(card.offer.marketKey).toLowerCase()} to the paper slip and saved the quote snapshot.`,
    cards: [card],
    slip: edit.slip,
    snapshots: edit.snapshot ? [edit.snapshot] : [],
    warnings: [...warnings, ...built.warnings],
    followUps: ["Explain the biggest uncertainty in this slip."],
  });
}

async function lowerLine(
  input: TurnInput,
  providers: ProviderSet,
  offers: Offer[],
  catalog: Offer[],
  events: Map<string, SportEvent>,
  warnings: string[],
  index: number | null,
): Promise<TurnResult> {
  const selection = targeted(input.slip, index);
  if (!selection) {
    const clarification =
      input.slip.selections.length === 0
        ? "The slip is empty, so there is no line to lower."
        : "Which selection should move to a lower line?";
    return finish(input, { narrative: clarification, clarification, warnings });
  }
  const fresh = offers
    .filter(
      (offer) =>
        offer.playerId === selection.playerId &&
        offer.eventId === selection.eventId &&
        offer.bookmakerKey === selection.bookmakerKey &&
        offer.side === selection.side &&
        marketFamily(offer.marketKey) === marketFamily(selection.marketKey) &&
        offer.line < selection.line - 0.001,
    )
    .sort((a, b) => b.line - a.line);
  if (fresh.length === 0) {
    if (warnings.some((warning) => warning.toLowerCase().includes("unavailable")) || offers.length === 0) {
      return lowerFromStored(input, selection, warnings);
    }
    return finish(input, {
      narrative: `No lower ${selection.side} line for ${selection.playerName} was in the retrieved ${selection.bookmakerTitle} markets. The selection was left unchanged.`,
      warnings,
    });
  }
  const built = await cardsFor(input, providers, related(offers, fresh[0]), events, catalog);
  const matched = built.cards.find((item) => item.offer.id === fresh[0].id);
  if (!matched) return finish(input, { narrative: "The alternate line was missing its event.", warnings });
  const card = (await withLiveRole(input.mode, [matched]))[0] ?? matched;
  return applyReplacement(input, selection, card, offers, [...warnings, ...built.warnings], "lower_line");
}

function lowerFromStored(input: TurnInput, selection: SlipSelection, warnings: string[]): TurnResult {
  const stored = selection.alternates
    .filter((alternate) => alternate.side === selection.side && alternate.line < selection.line - 0.001)
    .sort((a, b) => b.line - a.line);
  if (stored.length === 0) {
    return finish(input, {
      narrative:
        "A fresh odds response was unavailable, and the stored quote has no lower line. The selection was left unchanged.",
      warnings,
    });
  }
  const alternate = stored[0];
  const event = eventFromSelection(selection);
  const offer: Offer = {
    id: alternate.offerId,
    eventId: selection.eventId,
    marketKey: alternate.marketKey,
    playerId: selection.playerId,
    playerName: selection.playerName,
    teamName: selection.teamName,
    bookmakerKey: alternate.bookmakerKey,
    bookmakerTitle: alternate.bookmakerTitle,
    side: alternate.side,
    line: alternate.line,
    oddsAmerican: alternate.oddsAmerican,
    oddsDecimal: alternate.oddsDecimal,
    alternate: alternate.marketKey.endsWith("_alternate"),
    source: selection.source,
    fetchedAt: selection.fetchedAt,
    sourceUpdatedAt: selection.sourceUpdatedAt,
    fictional: selection.fictional,
  };
  if (input.mode === "live" && offer.fictional) {
    return finish(input, {
      narrative: "The stored quote is fictional, so it was not applied in live mode.",
      warnings,
    });
  }
  const card = buildResearchCard({
    offer,
    event,
    logs: selection.logs,
    teamName: selection.teamName,
    availability: selection.availability,
    availabilityState: selection.availabilityState,
    statsSource: {
      source: selection.source,
      fetchedAt: selection.fetchedAt,
      sourceUpdatedAt: selection.sourceUpdatedAt,
      stale: true,
      fictional: selection.fictional,
    },
    availabilitySource: {
      source: selection.source,
      fetchedAt: selection.fetchedAt,
      sourceUpdatedAt: selection.sourceUpdatedAt,
      stale: true,
      fictional: selection.fictional,
    },
  });
  card.limitations = [
    ...card.limitations,
    "This line was taken from the quote stored on the slip because a fresh odds response was unavailable. Treat the price as stale.",
  ];
  return applyReplacement(input, selection, card, [], warnings, "lower_line");
}

function eventFromSelection(selection: SlipSelection): SportEvent {
  const [away, home] = selection.eventLabel.split(" at ");
  return {
    id: selection.eventId,
    awayTeamName: away || selection.eventLabel,
    homeTeamName: home || selection.eventLabel,
    commenceTime: selection.commenceTime,
  };
}

async function replaceIndexed(
  input: TurnInput,
  providers: ProviderSet,
  offers: Offer[],
  catalog: Offer[],
  events: Map<string, SportEvent>,
  warnings: string[],
  index: number | null,
): Promise<TurnResult> {
  const selection = selectionByIndex(input.slip, index);
  if (!selection) {
    return finish(input, {
      narrative: "That selection number is not on the slip.",
      clarification: "That selection number is not on the slip.",
      warnings,
    });
  }
  const overs = offers.filter((offer) => !offer.alternate && offer.side === "over");
  const built = await cardsFor(input, providers, capCandidates(overs, input.limits.candidatePlayerCap), events, catalog);
  const remaining = {
    ...input.slip,
    selections: input.slip.selections.filter((item) => item.id !== selection.id),
  };
  const candidate = suggestFromCards(built.cards, 6).chosen.find((card) => {
    if (card.offer.playerId === selection.playerId && marketFamily(card.offer.marketKey) === marketFamily(selection.marketKey)) {
      return false;
    }
    return addSelection(remaining, card, [], input.now).ok;
  });
  if (!candidate) {
    return finish(input, {
      narrative: `No alternative cleared the evidence bar, so ${selection.playerName} stayed on the slip.`,
      warnings: [...warnings, ...built.warnings],
    });
  }
  return applyReplacement(input, selection, candidate, offers, [...warnings, ...built.warnings], "replace");
}

function applyReplacement(
  input: TurnInput,
  selection: SlipSelection,
  card: ResearchCard,
  offers: Offer[],
  warnings: string[],
  action: string,
): TurnResult {
  const edit = replaceSelection(
    input.slip,
    selection.id,
    card,
    offers.length ? alternatesFor(card.offer, offers) : cardToAlternates(card, selection),
    input.now,
  );
  if (!edit.ok) {
    return finish(input, {
      narrative: edit.reason,
      cards: [card],
      rejected: [{ action, reason: edit.reason }],
      warnings,
    });
  }
  return finish(input, {
    narrative: `Replaced ${selection.playerName} ${selection.side} ${selection.line} with ${card.offer.playerName} ${card.offer.side} ${card.offer.line} ${marketLabel(card.offer.marketKey).toLowerCase()}. The original snapshot is unchanged in the history.`,
    cards: [card],
    slip: edit.slip,
    snapshots: edit.snapshot ? [edit.snapshot] : [],
    warnings,
    followUps: ["Explain the biggest uncertainty in this slip."],
  });
}

function cardToAlternates(card: ResearchCard, selection: SlipSelection) {
  const current = selection.alternates.filter((alternate) => alternate.offerId !== card.offer.id);
  return [
    ...current,
    {
      offerId: card.offer.id,
      marketKey: card.offer.marketKey,
      side: card.offer.side,
      line: card.offer.line,
      oddsAmerican: card.offer.oddsAmerican,
      oddsDecimal: card.offer.oddsDecimal,
      bookmakerKey: card.offer.bookmakerKey,
      bookmakerTitle: card.offer.bookmakerTitle,
    },
  ];
}

function targeted(slip: Slip, index: number | null): SlipSelection | null {
  if (index != null) return selectionByIndex(slip, index);
  if (slip.selections.length === 1) return slip.selections[0];
  return null;
}

async function maybeNarrate(
  input: TurnInput,
  providers: ProviderSet,
  template: string,
  cards: ResearchCard[],
  warnings: string[],
): Promise<{ narrative: string; narrator: TurnResult["narrator"] }> {
  if (input.mode !== "live" || !providers.language.configured) {
    return { narrative: template, narrator: "template" };
  }
  const evidence = cards.map((card) => ({
    player: card.offer.playerName,
    market: marketLabel(card.offer.marketKey),
    side: card.offer.side,
    line: card.offer.line,
    americanOdds: card.offer.oddsAmerican,
    book: card.offer.bookmakerTitle,
    hits: card.hitRate.hits,
    decisive: card.hitRate.decisive,
    pushes: card.hitRate.pushes,
    sampleSize: card.hitRate.sampleSize,
    averageMinutes: card.minutes.average,
    availability: card.availability?.status ?? card.availabilityState,
    rankingScore: Number(card.baseline.score.toFixed(3)),
    qualified: card.baseline.qualified,
    excludeReason: card.baseline.excludeReason,
    missing: card.missing,
  }));
  const narrated = await providers.language.narrate({ evidence, question: input.message });
  if (narrated.status === "unavailable") {
    warnings.push(`${narrated.message} Showing the calculated summary instead.`);
    return { narrative: template, narrator: "template" };
  }
  if (!narrativeAllowed(narrated.data.summary)) {
    warnings.push(
      "The language-model draft was discarded because it added a claim the evidence rules do not allow.",
    );
    return { narrative: template, narrator: "template" };
  }
  if (
    !summaryMatchesRecords(
      narrated.data.summary,
      cards.map((card) => card.hitRate),
    )
  ) {
    warnings.push("The language-model draft cited a hit rate that was not in the game log. Showing the calculated summary instead.");
    return { narrative: template, narrator: "template" };
  }
  return { narrative: narrated.data.summary, narrator: "language-model" };
}

function summarizeSlip(slip: Slip): string {
  if (slip.selections.length === 0) return "The paper slip is empty.";
  return slip.selections
    .map(
      (selection, index) =>
        `${index + 1}. ${selection.playerName} ${selection.side} ${selection.line} ${selection.marketLabel} (${selection.eventLabel})`,
    )
    .join("\n");
}

function finish(
  input: TurnInput,
  patch: Partial<TurnResult> & { narrative: string },
): TurnResult {
  return {
    mode: input.mode,
    fictional: input.mode === "demo",
    narrator: patch.narrator ?? "template",
    cards: (patch.cards ?? []).slice(0, 8),
    uncertainty: patch.uncertainty ?? null,
    slip: patch.slip ?? input.slip,
    snapshots: patch.snapshots ?? [],
    clarification: patch.clarification ?? null,
    warnings: (patch.warnings ?? []).slice(0, 12),
    rejected: patch.rejected ?? [],
    followUps: (patch.followUps ?? []).slice(0, 6),
    proposalApplied: patch.proposalApplied ?? false,
    narrative: patch.narrative,
  };
}
