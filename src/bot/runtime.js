// Executes compiled Bot Builder code. Exposes the `bot` API the generated code calls,
// keeps a live tick buffer for analysis blocks, and stops cleanly on Stop / errors.

import { deriv } from '../lib/deriv.js';
import { TickBuffer, marketBySymbol, lastDigit } from '../lib/markets.js';
import { ledger, placeContract } from '../lib/trader.js';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const STOPPED = Symbol('bot-stopped');

export class BotRunner {
  constructor({ code, settings, currency = 'USD', balance = () => null }) {
    this.code = code;
    this.settings = settings;
    this.currency = currency;
    this.getBalance = balance;
    this.running = false;
    this.again = false;
    this.lastResult = null;
    this.lastProfit = 0;
    this.totalProfit = 0;
    this.runs = 0;
    this.lossStreak = 0;
    this.buffer = new TickBuffer(1000);
    this.tickWaiters = [];
    this.STOPPED = STOPPED;
  }

  async start() {
    const { symbol } = this.settings;
    const market = marketBySymbol(symbol);
    const hist = await deriv.ticksHistory(symbol, 1000);
    const decimals = hist.pipSize ?? market.decimals;
    this.buffer.load(hist.prices, hist.times, decimals);
    this.stopTicks = deriv.subscribe({ ticks: symbol }, (m) => {
      if (!m.tick) return;
      const q = Number(m.tick.quote);
      this.buffer.push(m.tick.epoch, q, lastDigit(q, m.tick.pip_size ?? decimals));
      this.tickWaiters.splice(0).forEach((w) => w());
    });

    this.running = true;
    ledger.setRunning({ source: 'bot', symbol });
    ledger.log(`Bot started on ${market.label}`, 'success');
    try {
      await new AsyncFunction('bot', this.code)(this);
      if (this.running) ledger.log('Bot finished: no "Trade again" reached.');
    } catch (e) {
      if (e !== STOPPED) ledger.log(`Bot error: ${e.message}`, 'error');
    } finally {
      this.cleanup();
    }
  }

  stop(reason = 'Stopped by user') {
    if (!this.running) return;
    this.running = false;
    ledger.log(reason);
    this.tickWaiters.splice(0).forEach((w) => w());
  }

  cleanup() {
    this.running = false;
    this.stopTicks?.();
    ledger.setRunning(null);
  }

  // ---- API used by generated code -----------------------------------------------------

  async purchase(contract, prediction, stake) {
    if (!this.running) throw STOPPED;
    const result = await placeContract({
      symbol: this.settings.symbol,
      contract,
      stake: Math.max(0.35, Number(stake) || 0.35),
      duration: this.settings.duration,
      barrier: prediction,
      currency: this.currency,
    }, { source: 'bot' });
    this.runs += 1;
    this.lastProfit = result.profit;
    this.totalProfit += result.profit;
    this.lastResult = result.profit > 0 ? 'win' : 'loss';
    this.lossStreak = this.lastResult === 'loss' ? this.lossStreak + 1 : 0;
    if (!this.running) throw STOPPED;
  }

  stat(name) {
    switch (name) {
      case 'lastProfit': return this.lastProfit;
      case 'totalProfit': return Number(this.totalProfit.toFixed(2));
      case 'runs': return this.runs;
      case 'balance': return this.getBalance() ?? 0;
      case 'lastDigit': return this.buffer.last?.digit ?? 0;
      case 'lastPrice': return this.buffer.last?.quote ?? 0;
      case 'lossStreak': return this.lossStreak;
      default: return 0;
    }
  }

  digitShare(n, kind, x) {
    const ds = this.buffer.digits(n);
    if (!ds.length) return 0;
    const test = {
      even: (d) => d % 2 === 0,
      odd: (d) => d % 2 === 1,
      over: (d) => d > x,
      under: (d) => d < x,
      equal: (d) => d === x,
    }[kind];
    return (ds.filter(test).length / ds.length) * 100;
  }

  extremeDigit(which, n) {
    const counts = Array(10).fill(0);
    this.buffer.digits(n).forEach((d) => counts[d]++);
    const target = which === 'most' ? Math.max(...counts) : Math.min(...counts);
    return counts.indexOf(target);
  }

  riseShare(n) {
    const items = this.buffer.items.slice(-(n + 1));
    let up = 0; let moves = 0;
    for (let i = 1; i < items.length; i++) {
      if (items[i].quote !== items[i - 1].quote) moves++;
      if (items[i].quote > items[i - 1].quote) up++;
    }
    return moves ? (up / moves) * 100 : 50;
  }

  async waitTicks(n) {
    for (let i = 0; i < n && this.running; i++) {
      await new Promise((r) => this.tickWaiters.push(r));
    }
    if (!this.running) throw STOPPED;
  }

  notify(text) {
    ledger.log(String(text));
  }
}
