# Baseline

Baseline is a chat-first NBA research desk. You can research player props, compare two quotes, edit a paper slip, and keep a manual result history. It does not place bets, move money, or claim a betting edge.

Factual retrieval and predictive performance are different. A historical hit rate is not the chance a prop wins. The ranking score is a documented heuristic, not a calibrated probability.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the URL printed by Next.js. The default data mode is demo, so the app runs with no API keys.

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## What works

- Chat for slate suggestions, single-prop research, comparisons, and slip edits.
- Demo mode with a fixed fictional slate, deterministic replies, and visible fictional labels.
- Live mode through the same provider interfaces. Missing keys or failed calls stay unavailable. Demo numbers are not substituted.
- Editable paper slips: add, remove, replace, stake, and alternate lines that were actually supplied.
- Several slips saved in this browser via a small storage interface. Local saves do not follow you to another browser.
- Payout math for American and decimal odds, with stake, total return, and net profit kept separate.
- An illustrative combined payout only when every selection is in a different game. Same-game combinations do not multiply prices into a sportsbook quote. The desk shows "Combined sportsbook quote unavailable" when a book parlay price was not retrieved. Pick'em rules are not used.
- Research cards with source, fetch time, source update time, logs, minutes, hit rate, sample size, availability, and supporting, opposing, and missing evidence.
- Suggestions that return fewer picks when the evidence bar is missed. Out and doubtful players, short samples, and low minutes are skipped.
- Same-game selections are flagged. Correlation is not quantified.
- Timestamped snapshots of quotes and evidence, kept when a slip is edited. History supports pending, won, lost, pushed, void, and ungraded. Manual grades are labeled manual. There is no invented performance history.

## Architecture

| Piece | Role |
| --- | --- |
| Odds provider | Demo fixtures, or The Odds API v4 |
| Stats provider | Demo logs, or BallDontLie `/nba/v1/stats` |
| Availability provider | Demo notes, or BallDontLie `/nba/v1/player_injuries` |
| Research | Hit rates, minutes, and the baseline heuristic, all in code |
| Language model | Groq (free tier) or OpenAI for open-ended phrasing. Demo uses a command parser and a template |
| Slip and payout | Validated edits and price math |
| Persistence | `DeskStore`, with `localStorage` in the browser and an in-memory store for tests |

Stable ids are derived from event ids, bookmaker keys, market keys, player names, side, and line. Player names from The Odds API are not league ids. Live stats are joined by normalized name and are left missing when the match is ambiguous.

The Odds API flow is the documented one: `GET /v4/sports/basketball_nba/events` (no quota cost) and `GET /v4/sports/basketball_nba/events/{eventId}/odds` for player markets. Alternate keys such as `player_points_alternate` are requested only when a line change or a single-prop lookup needs them. The desk does not assume those lines exist. It does not scrape DraftKings.

Supported research markets are points, rebounds, assists, threes, blocks, steals, and a few combined counting stats. The games board lists every upcoming event in the window and, for the selected game, loads points, rebounds, assists, and threes. Automatic suggestions still scan main-line overs for points, rebounds, and assists across the first `SLATE_EVENT_LIMIT` events (default 8). The Odds API only returns props the books have posted, and US books often post player props close to tip. When the configured region is thin, the client also checks US2 books and keeps the longer list. A short list is a book-posting limit, not a cap of four players in the app.

## Baseline heuristic

`baseline-heuristic-1` ranks a prop with four factors:

- Shrunk historical hit rate, weight 0.55. With at least one decisive game, the value is `(hits + 2) / (decisive games + 4)`. The prior pulls small samples toward 0.50. With no decisive games the factor is 0, not the prior.
- Minutes, weight 0.20. Average minutes divided by 34, capped at 1.
- Availability, weight 0.15. Available 1.00, questionable 0.55, not listed 0.50, unknown 0.45, doubtful 0.25, out 0. A missing feed scores 0.
- Sample size, weight 0.10. Decisive games divided by 8, capped at 1.

An automatic suggestion prefers props with at least 5 decisive games, average minutes of at least 20, and a player who is not listed out or doubtful. If nobody clears that bar, the slate still fills from posted main overs spread across different games. Pushes are reported and removed from the hit-rate denominator. The score is not a win probability, an expected value, or a confidence percentage.

## Provider limits

- Demo fixtures are fictional players, quotes, logs, and injury notes on a slate dated the evening of November 2, 2026 PT. Team names are labels only.
- Live odds need `THE_ODDS_API_KEY`. Player props are billed per event and market. Caching is in memory for `ODDS_CACHE_TTL_SECONDS`. A failed refresh can show the last successful payload only when it is marked stale.
- Live logs and injuries need `BALLDONTLIE_API_KEY`. The client follows the published OpenAPI: `https://api.balldontlie.io/nba/v1/...` with the key in the `Authorization` header. No opponent-adjusted matchup model is included, and none is invented.
- The injury endpoint has no documented update timestamp, so `sourceUpdatedAt` stays null. A player missing from a successful injury response is "not listed", which is not treated as confirmation they will play.
- Yes/no markets such as double-doubles are not priced. Combined parlay prices are not requested, because The Odds API does not return a quote for an arbitrary same-game or cross-game player-prop parlay in the endpoints this app uses.
- The language model is optional. A free key is available from [Groq](https://console.groq.com): create an account, open API Keys, and put the key in `.env.local` as `GROQ_API_KEY`. Restart the dev server. `OPENAI_API_KEY` is the paid alternative and is used when both keys are present. If neither key is set, or the model call fails, the command parser still handles player names and slate requests. Template copy is used when a model note fails validation or uses banned claim language.
- Chat throttling is a process-local window (`CHAT_REQUESTS_PER_MINUTE`). On Vercel each instance has its own window. It is not a durable global limit.
- Conversation context sent to the model is the current question, a short slip summary, and the compact evidence for the cards being explained. Game-log tables are not sent as a database dump.

## Deploy

The app is a Next.js App Router project and can be deployed on Vercel from GitHub.

1. Import the repository in Vercel.
2. Set the environment variables from `.env.example`. Leave keys empty to stay in demo, or set `APP_DATA_MODE=live` plus the keys you have.
3. Do not prefix secrets with `NEXT_PUBLIC`. Provider calls stay on the server.
4. Deploy. `npm run build` is the production build.

Serverless instances do not share the odds cache or the chat throttle. The browser still holds slips and snapshots locally.

## Not in this version

Authentication, payments, automatic bet placement, and model training are intentionally absent. Manual settlement is the only result entry. There is no claim that the heuristic beats a sportsbook.
