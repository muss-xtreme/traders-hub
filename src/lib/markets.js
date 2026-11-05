// Market catalogue, last-digit helpers and the rolling tick statistics buffer
// used by DCircles, Speed Lab and Bulk Trader.

export const VOLATILITY = [
  { value: 'R_10', label: 'Volatility 10 Index', short: 'Vol 10', decimals: 3 },
  { value: 'R_25', label: 'Volatility 25 Index', short: 'Vol 25', decimals: 3 },
  { value: 'R_50', label: 'Volatility 50 Index', short: 'Vol 50', decimals: 4 },
  { value: 'R_75', label: 'Volatility 75 Index', short: 'Vol 75', decimals: 4 },
  { value: 'R_100', label: 'Volatility 100 Index', short: 'Vol 100', decimals: 2 },
  { value: '1HZ10V', label: 'Volatility 10 (1s) Index', short: 'Vol 10 (1s)', decimals: 2 },
  { value: '1HZ25V', label: 'Volatility 25 (1s) Index', short: 'Vol 25 (1s)', decimals: 2 },
  { value: '1HZ50V', label: 'Volatility 50 (1s) Index', short: 'Vol 50 (1s)', decimals: 2 },
  { value: '1HZ75V', label: 'Volatility 75 (1s) Index', short: 'Vol 75 (1s)', decimals: 2 },
  { value: '1HZ100V', label: 'Volatility 100 (1s) Index', short: 'Vol 100 (1s)', decimals: 2 },
];

export const JUMP = [
  { value: 'JD10', label: 'Jump 10 Index', short: 'Jump 10', decimals: 2 },
  { value: 'JD25', label: 'Jump 25 Index', short: 'Jump 25', decimals: 2 },
  { value: 'JD50', label: 'Jump 50 Index', short: 'Jump 50', decimals: 2 },
  { value: 'JD75', label: 'Jump 75 Index', short: 'Jump 75', decimals: 2 },
  { value: 'JD100', label: 'Jump 100 Index', short: 'Jump 100', decimals: 2 },
];

export const MARKETS = [...VOLATILITY, ...JUMP];
export const marketBySymbol = (s) => MARKETS.find((m) => m.value === s) ?? VOLATILITY[0];

export const CONTRACTS = [
  { value: 'CALL', label: 'Rise', group: 'rise_fall' },
  { value: 'PUT', label: 'Fall', group: 'rise_fall' },
  { value: 'DIGITEVEN', label: 'Even', group: 'even_odd' },
  { value: 'DIGITODD', label: 'Odd', group: 'even_odd' },
  { value: 'DIGITOVER', label: 'Over', group: 'over_under', barrier: true },
  { value: 'DIGITUNDER', label: 'Under', group: 'over_under', barrier: true },
  { value: 'DIGITMATCH', label: 'Matches', group: 'matches_differs', barrier: true },
  { value: 'DIGITDIFF', label: 'Differs', group: 'matches_differs', barrier: true },
];
export const contractInfo = (c) => CONTRACTS.find((x) => x.value === c);

// Last digit of a quote at the market's display precision (keeps trailing zeros).
export const lastDigit = (quote, decimals) => {
  const d = parseInt(Number(quote).toFixed(decimals).slice(-1), 10);
  return Number.isFinite(d) ? d : 0;
};

// Fixed-capacity ring buffer with incremental counters (O(1) per tick).
export class TickBuffer {
  constructor(capacity = 1000) {
    this.capacity = capacity;
    this.reset();
  }

  reset() {
    this.items = [];
    this.counts = Array(10).fill(0);
    this.even = 0;
    this.rises = 0;
    this.falls = 0;
  }

  push(time, quote, digit) {
    if (this.items.length === this.capacity) {
      const old = this.items.shift();
      this.counts[old.digit]--;
      if (old.digit % 2 === 0) this.even--;
      const next = this.items[0];
      if (next) {
        if (next.quote > old.quote) this.rises--;
        else if (next.quote < old.quote) this.falls--;
      }
    }
    const prev = this.items[this.items.length - 1];
    if (prev) {
      if (quote > prev.quote) this.rises++;
      else if (quote < prev.quote) this.falls++;
    }
    this.items.push({ time, quote, digit });
    this.counts[digit]++;
    if (digit % 2 === 0) this.even++;
  }

  load(prices, times, decimals) {
    this.reset();
    prices.forEach((p, i) => this.push(times[i] ?? i, p, lastDigit(p, decimals)));
  }

  get length() { return this.items.length; }
  get last() { return this.items[this.items.length - 1] ?? null; }
  digits(n = this.items.length) { return this.items.slice(-n).map((t) => t.digit); }

  percentages() {
    const n = this.items.length || 1;
    return this.counts.map((c) => (c / n) * 100);
  }

  evenOdd() {
    const n = this.items.length || 1;
    const even = (this.even / n) * 100;
    return { even, odd: 100 - even };
  }

  riseFall() {
    const moves = this.rises + this.falls || 1;
    return { rise: (this.rises / moves) * 100, fall: (this.falls / moves) * 100 };
  }

  // Percent of digits strictly over, equal to and under `digit`.
  overUnder(digit) {
    const n = this.items.length || 1;
    let over = 0; let equal = 0;
    this.counts.forEach((c, d) => { if (d > digit) over += c; else if (d === digit) equal += c; });
    return { over: (over / n) * 100, equal: (equal / n) * 100, under: ((n - over - equal) / n) * 100 };
  }
}
