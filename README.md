# Traders Hub

A Deriv trading workspace for synthetic volatility indices: live digit analytics, a block-based
bot builder, high-frequency Speed Lab, a Bulk Trader and a floating statistical market scanner.

It is an original implementation built from a reverse-engineering study of a public Deriv-bot
site (see [`research/FINDINGS.md`](research/FINDINGS.md)). None of that site's code, bot files or
assets are included.

## Features

| Tab | What it does |
|---|---|
| **Free Bots** | Original strategy templates (Parity Reversion, Threshold Recovery, Cold Digit Differs, Tick Momentum) that open as editable blocks |
| **Bulk Trader** | Fires N identical digit contracts on the next tick, optionally across several volatility markets, with an auto-repeat loop limited by TP/SL |
| **Dashboard** | Import a bot (`.xml` / `.json`), open Bot Builder, or start from a quick strategy |
| **Bot Builder** | Blockly workspace with trading blocks (trade parameters, purchase, restart conditions, result/stat/analysis blocks); compiled to JS and run against Deriv |
| **DCircles** | Rolling 1000-tick last-digit distribution, Even/Odd and Over/Under analysis, rise/fall movement, digit stream |
| **Pro Analysis** | Blue dashboard: live digit probability grid, price/tick stats, true contract odds, chi-square randomness test, one-tap trades — all from real Deriv ticks |
| **Speed Lab** | Single, Bulk, Hedge, Multi-Market and Even/Odd loops, every-tick mode, martingale with step cap, TP/SL/max-rounds |
| **AI scanner (floating orb)** | Draggable orb → Smart Scan / Auto Pilot / Deviation Scan. Pulls tick history for every volatility index, scores digit distributions and ranks markets |

### Safety model

- Your Deriv token is stored only in this browser and sent only to Deriv.
- Loading a bot (from templates or the scanner) **never starts it**. Every trading start asks for
  confirmation once per session on demo, and every time on a real account.
- The scanner is statistics over past ticks. Past digit distributions do not predict the next tick.

## Running

```bash
npm install
npm run dev        # http://localhost:5180
npm test           # scanner + tick-buffer unit tests
npm run build
```

Market data works without configuration (public Deriv endpoint). To trade, either paste a Deriv
personal access token (**API Token Login**) or configure OAuth: copy `.env.example` to `.env` and set
`VITE_DERIV_CLIENT_ID` (and `VITE_DERIV_APP_ID`) from your app registration at Deriv.

## Architecture

```
src/
  lib/deriv.js      public market-data socket + per-account OTP trading socket, REST accounts/OTP
  lib/auth.js       OAuth 2.0 authorization code + PKCE
  lib/session.jsx   React session: accounts, balance, display currency, trade confirmation, useTicks
  lib/markets.js    symbols, contracts, last-digit helper, O(1) rolling TickBuffer
  lib/scanner.js    scan strategies (even/odd reversion, over2/under8, z-score deviation) + orchestration
  lib/trader.js     buy + settle contracts, bulk placement, shared ledger for the run panel
  bot/blocks.js     custom Blockly blocks and JS generator
  bot/runtime.js    BotRunner — the `bot` API used by generated code
  bot/templates.js  strategy templates as Blockly JSON
  bot/controller.js workspace ↔ run panel ↔ loaders
  components/       Header, RunPanel, ScannerFab, shared UI
  pages/            Landing, Dashboard, BotBuilder, DCircles, SpeedLab, BulkTrader, FreeBots, Charts/Tutorials
research/
  FINDINGS.md       reverse-engineering report (REA evidence IDs, endpoints, algorithms);
                    profitpluspro/FINDINGS.md — analysis of a fake "AI predictions" site
  tools/            CDP helper and asset mirror script used during the study
```

## Disclaimer

Trading digit and binary-option contracts carries a high risk of losing your stake. This software is
provided as-is for educational purposes; use a demo account first.
