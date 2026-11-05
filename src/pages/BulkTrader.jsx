// Bulk Trader: fire N identical digit contracts at once on the next tick (optionally across
// several volatility markets), with live digit statistics and an optional auto-repeat loop.

import { useRef, useState } from 'react';
import { VOLATILITY } from '../lib/markets.js';
import { useSession, useTicks, useLedger } from '../lib/session.jsx';
import { ledger, nextTick, placeBulk } from '../lib/trader.js';
import { DigitCircles, ParityStrip, Field, MarketSelect, money } from '../components/ui.jsx';

const TYPES = {
  even_odd: { label: 'Even/Odd', sides: [['DIGITEVEN', 'Even'], ['DIGITODD', 'Odd']] },
  over_under: { label: 'Over/Under', sides: [['DIGITOVER', 'Over'], ['DIGITUNDER', 'Under']] },
  matches_differs: { label: 'Matches/Differs', sides: [['DIGITMATCH', 'Matches'], ['DIGITDIFF', 'Differs']] },
};

export default function BulkTrader() {
  const { account, confirmTrading } = useSession();
  const { running } = useLedger();
  const [symbol, setSymbol] = useState('R_100');
  const [type, setType] = useState('even_odd');
  const [window_, setWindow] = useState(1000);
  const [duration, setDuration] = useState(1);
  const [stake, setStake] = useState(0.5);
  const [count, setCount] = useState(10);
  const [markets, setMarkets] = useState(1);
  const [barrier, setBarrier] = useState(4);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState({ on: false, tp: 5, sl: 10 });
  const autoRef = useRef(false);
  const { buffer, loading, decimals } = useTicks(symbol, window_);

  const pct = buffer.percentages();
  const eo = buffer.evenOdd();
  const ou = buffer.overUnder(barrier);
  const sidePct = (c) => ({
    DIGITEVEN: eo.even, DIGITODD: eo.odd, DIGITOVER: ou.over, DIGITUNDER: ou.under,
    DIGITMATCH: pct[barrier], DIGITDIFF: 100 - pct[barrier],
  }[c]);

  const symbols = () => {
    const start = VOLATILITY.findIndex((m) => m.value === symbol);
    return Array.from({ length: Math.min(markets, VOLATILITY.length) }, (_, i) => VOLATILITY[(start + i) % VOLATILITY.length].value);
  };

  const fireRound = async (contract) => {
    await nextTick(symbol);
    const rounds = symbols().map((s) => placeBulk(
      { symbol: s, contract, stake, duration, barrier, currency: account?.currency ?? 'USD' },
      count, { source: 'bulk' },
    ));
    const results = (await Promise.all(rounds)).flat();
    return results.filter((r) => r.status === 'fulfilled').reduce((s, r) => s + r.value.profit, 0);
  };

  const fire = async (contract, label) => {
    const total = count * Math.min(markets, VOLATILITY.length);
    const ok = await confirmTrading(`${auto.on ? 'Auto-trade' : 'Place'} ${total} × ${label} contracts (${money(stake)} each, ${duration} tick${duration > 1 ? 's' : ''}) on ${symbols().join(', ')}.`).catch((e) => { ledger.log(e.message, 'error'); return false; });
    if (!ok) return;
    setBusy(true);
    ledger.setRunning({ source: 'bulk', symbol });
    try {
      if (!auto.on) { await fireRound(contract); return; }
      autoRef.current = true;
      let pnl = 0;
      while (autoRef.current) {
        pnl += await fireRound(contract);
        ledger.log(`Auto trader session P/L ${money(pnl)}`);
        if (pnl >= auto.tp) { ledger.log(`Auto trader take profit ${auto.tp} reached`, 'success'); break; }
        if (pnl <= -Math.abs(auto.sl)) { ledger.log(`Auto trader stop loss ${auto.sl} reached`, 'error'); break; }
      }
    } catch (e) {
      ledger.log(`Bulk trade failed: ${e.message}`, 'error');
    } finally {
      autoRef.current = false;
      setBusy(false);
      ledger.setRunning(null);
    }
  };

  const needsBarrier = type !== 'even_odd';

  return (
    <div className="page bulk">
      <div className="card">
        <div className="grid-2">
          <Field label="Market"><MarketSelect value={symbol} onChange={setSymbol} markets={VOLATILITY} disabled={busy} /></Field>
          <Field label="Trade type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
              {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Number of ticks analysed">
          <select className="input" value={window_} onChange={(e) => setWindow(Number(e.target.value))}>
            {[100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <div className="current-tick">
          <div><small className="muted">CURRENT TICK</small><b>{buffer.last ? buffer.last.quote.toFixed(decimals) : '—'}</b></div>
        </div>
        <DigitCircles percentages={pct} current={buffer.last?.digit} loading={loading} compact />
        <ParityStrip digits={buffer.digits(12)} mode={type === 'even_odd' ? 'eo' : 'ou'} barrier={barrier} />

        {needsBarrier && (
          <Field label={type === 'over_under' ? 'Barrier digit' : 'Prediction digit'}>
            <div className="digit-picker">
              {Array.from({ length: 10 }, (_, d) => (
                <button key={d} type="button" className={barrier === d ? 'is-active' : ''} onClick={() => setBarrier(d)}>{d}</button>
              ))}
            </div>
          </Field>
        )}

        <div className="grid-4">
          <Field label="Ticks">
            <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </Field>
          <Field label="Stake">
            <input className="input" type="number" min={0.35} step={0.05} value={stake} onChange={(e) => setStake(Number(e.target.value))} />
          </Field>
          <Field label="No. of bulk trades">
            <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="No. of volatilities">
            <select className="input" value={markets} onChange={(e) => setMarkets(Number(e.target.value))}>
              {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </Field>
        </div>
        <p className="muted tiny center">All bulk contracts open after the next tick, so contracts on the same market share one exit.</p>

        <div className="auto-row">
          <label className="check"><input type="checkbox" checked={auto.on} disabled={busy} onChange={(e) => setAuto({ ...auto, on: e.target.checked })} /> Auto trader</label>
          {auto.on && (
            <>
              <label>TP <input className="input input--sm" type="number" value={auto.tp} onChange={(e) => setAuto({ ...auto, tp: Number(e.target.value) })} /></label>
              <label>SL <input className="input input--sm" type="number" value={auto.sl} onChange={(e) => setAuto({ ...auto, sl: Number(e.target.value) })} /></label>
            </>
          )}
          {busy && auto.on && <button type="button" className="btn btn--danger" onClick={() => { autoRef.current = false; }}>Stop after this round</button>}
        </div>

        <div className="side-buttons">
          {TYPES[type].sides.map(([c, label], i) => (
            <button key={c} type="button" className={`side-btn ${i ? 'side-btn--b' : 'side-btn--a'}`}
              disabled={busy || Boolean(running && running.source !== 'bulk')} onClick={() => fire(c, `${label}${needsBarrier ? ` ${barrier}` : ''}`)}>
              <strong>{label}{needsBarrier ? ` ${barrier}` : ''}</strong>
              <small>{sidePct(c).toFixed(2)}%</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
