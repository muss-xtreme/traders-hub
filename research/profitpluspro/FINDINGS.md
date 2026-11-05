# profitpluspro.com — reverse-engineering findings (2026-11-05)

**Verdict: the "AI trading platform" displays fabricated data. It never connects to Deriv and never trades.**

Method: full static mirror of the Next.js build (`buildId OaiBpoZRhD4LszrzpyuB6`, 8 chunks, no lazy chunks),
REA `analyze_javascript_application` on the app chunks (evidence `ev_5b3429bf410ad49ad9f4f9f4da134e932b9f3c359448500143206576e332c484`:
27 modules, 5 request relations), and prettier-formatted reading of `app/page` (4,453 lines).

| Shown to the user | What the code does |
|---|---|
| "Live price" (e.g. $13.72 on Vol 10 1s) | `price = 20·Math.random() + 10` (+ variance noise); Boom/Crash 1000–3000, Step/Jump 100–300, HF 50–150. Real Vol 10 (1s) ≈ 9,500. |
| Current digit | Arithmetic hash of the random price (`(11·n + 5) % 10` etc.), not a last digit. |
| "Live Digit Probability 4.1%–15%, updates every 2 s" | `9.5 + 2·sin(0.1t+0.5d) + 1.5·cos(0.15t+0.3d) + sin(0.08t+0.8d) + …`, clamped to [4.1, 15], recomputed every 2 s. |
| "Processing Neural Networks…" | A 2-second timed progress animation with hard-coded step names. |
| "Confidence 72–96%" | e.g. Even/Odd: `min(1.5·|m−50|·k + … + 72, 96)` with `m` perturbed by `Date.now() % 1000`. Floor 72 %, cap 96 %. |
| "Advanced neural network analysis…" | String template filled with the fake numbers. |
| Connection status / Start | Starts a `setInterval` that appends fabricated ticks every ≤800 ms. No WebSocket exists in the bundle. |
| Login / Premium | `POST /api/credentials {username, password}` → shows `balance: 10000` (hard-coded). Access sold for **$125 via WhatsApp** (+254715646936) / Telegram `tradeswithjay001`. |
| Anti-inspection | Blocks right-click, selection, drag, Ctrl+Shift+I/J/C, Ctrl+S/A/P; clears the console every 3 s and on DevTools-sized window changes. |

The server-side `/api/credentials` handler is not shipped to the browser and was not recovered; it only gates the page.
The site's code and assets are not included in this repository (`research/profitpluspro/` mirror is git-ignored).
