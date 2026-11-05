// Trade execution + the shared session ledger shown in the run panel
// (Summary / Transactions / Journal). React reads it through useSyncExternalStore.

import { deriv, trading } from './deriv.js';
import { contractInfo } from './markets.js';

// ---- tiny external store ---------------------------------------------------------------

const emptyTotals = () => ({ stake: 0, payout: 0, runs: 0, won: 0, lost: 0, profit: 0 });
let state = { transactions: [], journal: [], totals: emptyTotals(), running: null, lastResult: null };
const listeners = new Set();

const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const ledger = {
  subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  get: () => state,
  log(message, level = 'info') {
    const entry = { id: crypto.randomUUID(), time: new Date(), message, level };
    set({ journal: [entry, ...state.journal].slice(0, 500) });
  },
  setRunning(running) { set({ running }); },
  reset() { set({ transactions: [], journal: [], totals: emptyTotals(), lastResult: null }); },
};

// ---- contract parameters ---------------------------------------------------------------

export function buildParameters({ symbol, contract, stake, duration = 1, durationUnit = 't', barrier, currency = 'USD' }) {
  const p = {
    amount: Number(Number(stake).toFixed(2)),
    basis: 'stake',
    contract_type: contract,
    currency,
    duration: Number(duration),
    duration_unit: durationUnit,
    underlying_symbol: symbol, // new Deriv API (OTP sessions) key
  };
  if (contractInfo(contract)?.barrier) p.barrier = String(Math.min(9, Math.max(0, Math.round(Number(barrier ?? 5)))));
  return p;
}

// ---- execution -------------------------------------------------------------------------

function upsertTx(tx) {
  const i = state.transactions.findIndex((t) => t.id === tx.id);
  const transactions = i === -1 ? [tx, ...state.transactions] : state.transactions.map((t, j) => (j === i ? tx : t));
  set({ transactions: transactions.slice(0, 1000) });
}

function settle(tx) {
  const t = state.totals;
  const won = tx.profit > 0;
  set({
    totals: {
      stake: t.stake + tx.buyPrice,
      payout: t.payout + (tx.sellPrice ?? 0),
      runs: t.runs + 1,
      won: t.won + (won ? 1 : 0),
      lost: t.lost + (won ? 0 : 1),
      profit: t.profit + tx.profit,
    },
    lastResult: won ? 'win' : 'loss',
  });
}

/** Buy one contract and resolve when Deriv reports it sold/expired. */
export async function placeContract(params, { source = 'manual' } = {}) {
  const parameters = buildParameters(params);
  const label = `${contractInfo(parameters.contract_type)?.label ?? parameters.contract_type}${parameters.barrier !== undefined ? ` ${parameters.barrier}` : ''}`;
  const { symbol } = params;

  const client = trading.client;
  const res = await client.send({ buy: '1', price: parameters.amount, parameters });
  const buy = res.buy;
  const tx = {
    id: buy.contract_id,
    source,
    symbol,
    label,
    buyPrice: Number(buy.buy_price),
    payout: Number(buy.payout),
    time: new Date(),
    status: 'open',
    profit: 0,
  };
  upsertTx(tx);
  ledger.log(`Bought ${label} on ${symbol} for ${tx.buyPrice.toFixed(2)} (${source})`);

  return new Promise((resolve, reject) => {
    const stop = client.subscribe(
      { proposal_open_contract: 1, contract_id: buy.contract_id },
      (m) => {
        const c = m.proposal_open_contract;
        if (!c) return;
        const live = { ...tx, entry: c.entry_tick_display_value, exit: c.exit_tick_display_value, profit: Number(c.profit ?? 0) };
        if (c.is_sold) {
          stop();
          const done = { ...live, status: Number(c.profit) > 0 ? 'won' : 'lost', sellPrice: Number(c.sell_price ?? 0) };
          upsertTx(done);
          settle(done);
          ledger.log(`${label} ${done.status === 'won' ? 'won' : 'lost'} ${done.profit.toFixed(2)}`, done.status === 'won' ? 'success' : 'error');
          resolve(done);
        } else {
          upsertTx(live);
        }
      },
      (err) => { stop(); reject(new Error(err.message ?? 'Contract stream failed')); },
    );
  });
}

/** Fire `count` identical contracts in parallel (bulk mode). */
export async function placeBulk(params, count, opts) {
  const n = Math.min(50, Math.max(1, Math.floor(count)));
  const results = await Promise.allSettled(Array.from({ length: n }, () => placeContract(params, opts)));
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) ledger.log(`${failed.length}/${n} bulk buys failed: ${failed[0].reason.message}`, 'error');
  return results;
}

/** Resolve on the next tick of `symbol` (bulk trades all start on the same fresh tick). */
export function nextTick(symbol, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let first = true;
    const timer = setTimeout(() => { stop(); reject(new Error('Timed out waiting for the next tick')); }, timeoutMs);
    const stop = deriv.subscribe({ ticks: symbol }, (m) => {
      if (!m.tick) return;
      if (first) { first = false; return; } // the first message is the current tick
      clearTimeout(timer);
      stop();
      resolve(m.tick);
    }, (e) => { clearTimeout(timer); reject(new Error(e.message)); });
  });
}
