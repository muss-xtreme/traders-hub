// Statistical market scanner (the "AI Scanner").
// Pulls recent tick history for every volatility index, scores each market's last-digit
// distribution and returns the single best opportunity. Pure analysis — it never trades.

import { VOLATILITY, JUMP, lastDigit } from './markets.js';

export const SCAN_MODES = {
  smart: { label: 'Smart Scan', subtitle: 'Even / Odd mean reversion', tradeType: 'even_odd', strategy: 'even_odd_reversion' },
  autopilot: { label: 'Auto Pilot', subtitle: 'Over 2 / Under 8 with recovery barrier', tradeType: 'over_under', strategy: 'over2_under8' },
  deviation: { label: 'Deviation Scan', subtitle: 'Z-score digit deviation, any trade type', tradeType: 'over_under', strategy: 'deviation' },
};

export const clampTicks = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(5000, Math.max(100, v)) : 500;
};

// ---- distribution maths -------------------------------------------------------------

export function digitTable(digits) {
  const n = digits.length;
  const counts = Array(10).fill(0);
  digits.forEach((d) => counts[d]++);
  const sd = Math.sqrt(n * 0.1 * 0.9);
  return counts.map((count, digit) => {
    const freq = n ? count / n : 0;
    return {
      digit,
      count,
      pct: freq * 100,
      deviation: Math.abs(freq - 0.1),
      z: sd > 0 ? (count - 0.1 * n) / sd : 0,
    };
  });
}

// Normalised Shannon entropy: 1 = perfectly uniform digits.
export function entropy(digits) {
  const n = digits.length || 1;
  const counts = Array(10).fill(0);
  digits.forEach((d) => counts[d]++);
  const h = counts.reduce((acc, c) => (c ? acc - (c / n) * Math.log2(c / n) : acc), 0);
  return h / Math.log2(10);
}

const zGate = (n) => (n <= 60 ? 1.15 : n <= 120 ? 1.35 : 1.5);
const share = (digits, pred) => (digits.filter(pred).length / (digits.length || 1)) * 100;

// ---- strategies: each returns {contract, barrier, recoveryBarrier?, confidence, reason} | null

export const STRATEGIES = {
  // Majority parity → bet the opposite side, expecting reversion toward 50/50.
  even_odd_reversion(digits) {
    const even = share(digits, (d) => d % 2 === 0);
    const odd = 100 - even;
    const top = Math.max(even, odd);
    if (top < 55) return null;
    const contract = even >= odd ? 'DIGITODD' : 'DIGITEVEN';
    return {
      contract,
      barrier: null,
      confidence: Math.min(99, top),
      reason: `${even >= odd ? 'Even' : 'Odd'} digits at ${top.toFixed(1)}% — trade ${contract === 'DIGITODD' ? 'Odd' : 'Even'} for reversion.`,
    };
  },

  // Strong low/high skew → Over 2 (recover with Over 3) or Under 8 (recover with Under 7).
  over2_under8(digits) {
    const over2 = share(digits, (d) => d >= 3);
    const under8 = share(digits, (d) => d <= 7);
    const useOver = over2 >= under8;
    const top = useOver ? over2 : under8;
    if (top < 52) return null;
    return {
      contract: useOver ? 'DIGITOVER' : 'DIGITUNDER',
      barrier: useOver ? 2 : 8,
      recoveryBarrier: useOver ? 3 : 7,
      confidence: Math.min(99, top),
      reason: useOver
        ? `Digits 3–9 are ${over2.toFixed(1)}% → Over 2 (recovery Over 3).`
        : `Digits 0–7 are ${under8.toFixed(1)}% → Under 8 (recovery Under 7).`,
    };
  },

  // Z-score deviation with multi-window agreement and an entropy reliability check.
  deviation(digits, tradeType = 'over_under') {
    if (digits.length < 30) return null;
    const table = digitTable(digits);
    const gate = zGate(digits.length);
    const maxZ = Math.max(...table.map((r) => Math.abs(r.z)));
    if (maxZ < gate) return null;

    const pick = (ds) => {
      const t = digitTable(ds);
      const hot = t.reduce((a, b) => (b.deviation > a.deviation ? b : a));
      const over = hot.pct > 10;
      if (tradeType === 'even_odd') {
        const evenShare = t.filter((r) => r.digit % 2 === 0).reduce((s, r) => s + r.pct, 0);
        return { contract: evenShare > 50 ? 'DIGITODD' : 'DIGITEVEN', barrier: null, hot };
      }
      if (tradeType === 'matches_differs') {
        return { contract: over ? 'DIGITDIFF' : 'DIGITMATCH', barrier: hot.digit, hot };
      }
      const goOver = (over && hot.digit >= 5) || (!over && hot.digit <= 4);
      return { contract: goOver ? 'DIGITOVER' : 'DIGITUNDER', barrier: goOver ? 2 : 7, hot };
    };

    const main = pick(digits);
    const windows = [25, 50].map((w) => digits.slice(-w)).filter((w) => w.length >= 10).map(pick);
    const agree = windows.length ? windows.filter((w) => w.contract === main.contract).length / windows.length : 0;
    if (agree < 0.5) return null;
    const reliability = 1 - entropy(digits) + 0.3;
    if (reliability < 0.25) return null;

    const base = Math.min(95, 80 * Math.min(1, main.hot.deviation / 0.1) + 15);
    const confidence = Math.min(99, base + Math.min(10, (maxZ - gate) * 3) + (agree - 0.5) * 20);
    if (confidence < 55) return null;
    return {
      contract: main.contract,
      barrier: main.barrier,
      confidence,
      reason: `Digit ${main.hot.digit} ${main.hot.pct > 10 ? 'over' : 'under'}-represented at ${main.hot.pct.toFixed(1)}% (|Z| ${maxZ.toFixed(2)}, ${Math.round(agree * 100)}% window agreement).`,
    };
  },
};

// Score one market's digits with the chosen strategy (exported for tests).
export function evaluate(digits, strategy, tradeType) {
  if (digits.length < 30) return null;
  return STRATEGIES[strategy](digits, tradeType);
}

// ---- scan orchestration --------------------------------------------------------------

const LAST_WINNER_KEY = 'th.scanner.lastWinner';

/**
 * @param {object} client  DerivClient-like object with ticksHistory(symbol, count)
 * @param {object} opts    {mode, ticks, includeJump, onProgress}
 */
export async function scanMarkets(client, { mode = 'smart', ticks = 500, includeJump = false, onProgress } = {}) {
  const { strategy, tradeType } = SCAN_MODES[mode];
  const count = clampTicks(ticks);
  let markets = includeJump ? [...VOLATILITY, ...JUMP] : [...VOLATILITY];

  // Rotate away from the previous winner so consecutive scans spread across markets.
  let last = null;
  try { last = localStorage.getItem(LAST_WINNER_KEY); } catch { /* storage unavailable */ }
  if (last && markets.length > 1) markets = markets.filter((m) => m.value !== last);

  let done = 0;
  const errors = [];
  onProgress?.({ current: 0, total: markets.length, label: 'Fetching tick history…' });
  const histories = await Promise.all(markets.map(async (m) => {
    try {
      const h = await client.ticksHistory(m.value, count);
      const decimals = h.pipSize ?? m.decimals;
      onProgress?.({ current: ++done, total: markets.length, label: `Loaded ${m.short}` });
      return { market: m, digits: h.prices.map((p) => lastDigit(p, decimals)) };
    } catch (e) {
      errors.push(`${m.short}: ${e.message}`);
      onProgress?.({ current: ++done, total: markets.length, label: `${m.short} failed` });
      return null;
    }
  }));

  const loaded = histories.filter(Boolean);
  if (!loaded.length) throw new Error(`No tick history loaded. ${errors[0] ?? ''}`.trim());

  let best = null;
  const ranked = [];
  for (const { market, digits } of loaded) {
    const signal = evaluate(digits, strategy, tradeType);
    if (!signal) continue;
    const pct = digitTable(digits).map((r) => r.pct);
    const result = { symbol: market.value, marketName: market.label, ticks: digits.length, tradeType, mode, pct, ...signal };
    ranked.push(result);
    if (!best || result.confidence > best.confidence) best = result;
  }
  ranked.sort((a, b) => b.confidence - a.confidence);

  if (best) {
    try { localStorage.setItem(LAST_WINNER_KEY, best.symbol); } catch { /* ignore */ }
  }
  return { best, ranked, scanned: loaded.length, errors };
}
