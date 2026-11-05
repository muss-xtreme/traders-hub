# mytradershub.com — reverse-engineering findings

Target: `https://www.mytradershub.com/` (landing) and `/app#<tab>` (SPA).
Method: REA (`inspect_web_page` → `export_web_scripts` → `analyze_javascript_application`),
full static mirror from the Rspack runtime chunk map (`tools/mirror.mjs`), prettier-formatted
reading of the app chunks (`pretty/`), and live visual capture in Chrome (`shots/`).

REA evidence IDs (session 2026-11-05):
- page inspection (landing → /app): `ev_612ba4dd0ce9b2d99c338a7caeff53e6fe05dd11ad9c7ff33ab576408536d892`
- script export manifest: `ev_cb155318e491fe2e7e94fbaf36b64974cf346def398e371f93273bef9e3e75ab`
- JS application graph (chunks 641/137/332): `ev_90c9f9c1ff4d2bd15b94fc505a80100cfea8f7df24807768c493ff4433546ed2`

## 1. Stack (observed)

| Layer | Finding | Evidence |
|---|---|---|
| Build | Rspack, chunk global `webpackChunktrading_bot_template` | every chunk header |
| UI | React 18 + MobX (`observer`) + react-router, SCSS | `lib-react`, `lib-router`, index |
| Base | Fork of Deriv's open-source **deriv-bot** (Blockly workspace, `DBot`, `api_base`, run panel, Summary/Transactions/Journal) | `window.Blockly.derivWorkspace`, `api_base` |
| Market data / trading | Deriv WebSocket API v3 `wss://<server>/websockets/v3?app_id=…` | chunk 583 `getWebsocketURL` |
| Auth | Deriv OAuth (`oauth.deriv.com/oauth2/authorize`) **or** pasted API token | 583, login modal |
| Own backend | `/api/bot-sessions`, `/api/admin/runtime-control`, `/api/admin/nav-colors`, `/api/deriv-tokens`, `/api/deriv-accounts`, `/api/admin/trade`, `/api/admin/trades`, `/api/admin/refresh-sessions`, `/api/admin/login-access`, `/api/admin/demo-trade-limit`, `/api/trading-consent`, `/api/copy-trading-marketing-demo` | grep of all chunks |
| Bot templates | Blockly XML served from `/bots/<name>.xml` and bundled XML chunks | module 67676, index module 73397 |
| Analytics | Google Tag Manager `GTM-KV9538TF` | app.html |

### Security-relevant observation
The API-token login modal states the token "is saved for admin trading, which is on by default".
The bundle posts tokens to `/api/deriv-tokens` and exposes admin endpoints
`/api/admin/trade` + `/api/admin/refresh-sessions`, i.e. the operator can place trades on users'
accounts server-side. `/api/admin/runtime-control` polls a remote `run | stop | broadcast` command
that every open client obeys. **The clone deliberately does NOT reproduce any of this**: tokens stay
in the browser, no remote control.

### Deriv "new API" (verified 2026-11-05)
- Legacy `wss://ws.derivws.com/websockets/v3?app_id=…` currently answers **Cloudflare 520** for every app_id.
- Public market data: `wss://api.derivws.com/trading/v1/options/ws/public` — same v3 JSON (`ticks_history`,
  `ticks`, `active_symbols`), no app_id, `authorize` → `UnknownMethod`.
- Auth: OAuth2 + PKCE at `https://auth.deriv.com/oauth2/auth?scope=trade&response_type=code&client_id=…`
  then `POST …/oauth2/token` (`grant_type=authorization_code`, `code_verifier`), or a personal access token.
- `GET https://api.derivws.com/trading/v1/options/accounts` (Bearer + `Deriv-App-ID`) →
  `data: [{account_id, account_type: demo|real, currency, balance, status}]`.
- `POST …/options/accounts/{id}/otp` → `data.url` = authenticated trading WebSocket (balance, buy, POC).
- On OTP sessions, contract parameters use **`underlying_symbol`** instead of `symbol` (module `rB`).
- The target also POSTs users' tokens **and OAuth refresh tokens** to its own `/api/deriv-accounts`.

## 2. Tabs (`DBOT_TABS`, index module 61944)

`DASHBOARD 0, BOT_BUILDER 1, CHART 2, TUTORIAL 3, COPYCAT 4, DCIRCLES 5, FREE_BOTS 6, SPEED_LAB 7,
DTRADER 8, HEDGE_HUB 9, PREMIUM_BOTS 10, KYZEN_SNIPER 11 ("Olympus Sniper"), BULK_TRADER 12`.
Hash routing: `/app#<id>`; nav order = Free Bots, Bulk Trader, Premium Bots, Dashboard, Bot Builder,
DCircles, Speed Lab, Olympus Sniper, Pro Hedge, Charts, Manual DTrader, Tutorials, Copy Trading.
A right-hand **run panel** (Run/Stop, execution FAST toggle, status, Summary/Transactions/Journal,
totals: stake, payout, runs, lost, won, P/L, Reset) is shared by all tabs.

### Dashboard
"Load or build your bot" — four tiles: My computer (XML import), Google Drive, Bot Builder,
Quick strategy; social links row.

### Bot Builder
Deriv Blockly workspace: "1. Trade parameters" (market › submarket › symbol, trade type category ›
type, contract type, candle interval, restart-on-error flags, *Run once at start*, *Trade options*:
duration, stake), "2. Purchase conditions", "3. Sell conditions", "4. Restart trading conditions"
(`Trade again`). Toolbar: Quick strategy, Reset, Import, Sort, Undo/Redo, Zoom.

### DCircles (chunk 686)
- Ring buffer of **1000** ticks; initial `ticks_history {count:1000, style:"ticks"}` then `ticks` subscribe.
- `lastDigit = parseInt(quote.toFixed(pip).slice(-1))`.
- Incremental stats: per-digit counts, even count, rises/falls (vs previous quote), recent 100 stream.
- UI: current price + market select (15 symbols: R_10…R_100, 1HZ10V…1HZ100V, JD10…JD100);
  10 digit circles with SVG progress ring + %; cursor ▲ under current digit; Highest/2nd/Lowest/2nd Low
  cards; Pattern Analysis toggle Even/Odd (even %, odd %, last-50 E/O badges) | Over/Under
  (select digit → over/equal/under %); Market Movement RISE/FALL %; Last Digits Stream; Statistics
  (total ticks, pip size).

### Speed Lab (chunk 332)
Modes: **Single Fast** (one contract per tick), **Bulk Trader** (N simultaneous), **Hedge**
(Rise+Fall at once), **Multi-Market** (scan all, buy best), **Even/Odd Strategy**.
Contract types: CALL, PUT, DIGITOVER, DIGITUNDER, DIGITEVEN, DIGITODD, DIGITMATCH, DIGITDIFF.
Trade setup: market, type, barrier, stake, duration (ticks), "Trade Every Tick", martingale on loss.
Buys via `{buy:"1", price, parameters:{amount, basis:"stake", contract_type, currency, duration,
duration_unit, symbol, barrier}}`.

### Bulk Trader (chunk 332, `sZ`)
Market, trade type (Even/Odd, Over/Under, Matches/Differs), number of ticks for stats (1000),
live digit circles, last-12 E/O strip, ticks, stake, **No. of bulk trades** (1–50),
**No. of volatilities**. Placement: wait for the **next tick**, then fire N buys in parallel
(`buy` with parameters; on failure fallback to `proposal` → `buy id`), "All bulk contracts open on
the selected market after the next tick, so they share one exit." Two big side buttons with live %
(e.g. Even 49.3% / Odd 50.7%). "AI SCANNER" button + "Auto trader".

## 3. AI Scanner floating window (chunk 641) — how it really works

There is **no AI model / LLM call**. It is a deterministic statistics scanner on Deriv tick history.

**FAB**: draggable 42×42 orb (`ai-scanner-fab-position` in localStorage), radar beam, rings,
particles; opens the "AI COMMAND" modal → *Choose a scan*:
- **MODULE 01 Smart Scan** ("entry" mode → trade type `even_odd`, strategy `even_odd_mr`)
- **MODULE 02 Auto Pilot** ("pro" mode → `over_under`, strategy `over2_under8`; settings stake,
  martingale, take-profit, stop-loss; loads *MT Sequence* (Over) or *MT Sequence Under*).
- A legacy "distribution scanner" (Raziel) supports `over_under | matches_differs | differs |
  even_odd | rise_fall` with default strategy.

**Scan pipeline** (`scanForDistributionDeviations(multiMarket, tradeType, symbol, onProgress,
tickCount, {strategy})`):
1. Market list = 10 volatility indices (Jump optional). If the last winner (`ai-scanner-last-winner-symbol`)
   was R_10/1HZ10V, those two are skipped this scan.
2. Tick count clamped to 100–5000 (default 500). Wait ≤25 s for API `opened`.
3. Parallel `ticks_history {end:"latest", count, style:"ticks"}` for every market (40 s timeout each);
   digits = last char of the price string.
4. Per market, need ≥30 ticks, then by strategy:
   - `even_odd_mr`: even% vs odd%; max ≥55% → trade the **opposite** (mean reversion); conf = max%.
   - `over2_under8`: % digits ≥3 vs % ≤7; if the larger ≥52% → OVER 2 (recovery OVER 3) or
     UNDER 8 (recovery UNDER 7).
   - `default`: frequency table (count, freq, deviation |f−0.1|, z = (c−0.1n)/√(0.09n),
     probabilityCorrection); gate: some |z| ≥ 1.15/1.35/1.5 (n ≤60/≤120/else); multi-timeframe
     consensus over last 25 & 50 digits ≥0.5; reliability = 1 − H(digits)/log2(10) + 0.3 ≥ 0.25;
     then fast paths (OVER_MAJORITY digits 3–9 ≥70% → OVER 2; EVEN_ODD majority; DIFFER cold/trend/hot)
     else STATISTICAL_REVERSION → DEVIATION_CORRECTION → PROBABILITY_ARBITRAGE; confidence boosts
     `min(10,(maxZ−gate)·3)` and `(mtf−0.5)·20`; default strategy drops <55% confidence.
5. Best = highest confidence; stored as last winner.
6. **Smart Scan and Auto Pilot then automatically**: switch to Bot Builder, fetch bot XML, regex-patch
   symbol/market/submarket, trade type, contract, stake, martingale, predictions (and TP/SL blocks
   for Auto Pilot), load into Blockly, and **click Run** (`#db-animation__run-button`). No confirmation.
   (Verified live — it placed demo trades immediately.)

## 4. Landing page
Light pink glass card: logo tile, "Mytraders / HUB", tagline "AI-driven bots for live volatility
markets — execute with precision.", three strategy tiles (EVEN/ODD Parity, OVER/UNDER Threshold,
RISE/FALL Momentum), "Establishing secure connection…" progress (0→100%), buttons *Sign in with
Deriv*, *API token login*, *Enter platform*; blurred colour blobs, dotted grid, bottom marquee ticker
(VOL 50, VOL 25, BOOM 1000, CRASH 1000, STEP INDEX, RANGE BREAK…). App loader: lightning orb,
"MYTRADERSHUB — STRIKE FAST · TRADE HARD · NO MERCY".
