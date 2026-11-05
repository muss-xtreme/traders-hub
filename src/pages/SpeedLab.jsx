// Speed Lab: high-frequency trading loops on live digits.
// Modes: Single Fast, Bulk, Hedge (Rise+Fall), Multi-Market (best digit edge), Even/Odd strategy.

import { useRef, useState } from 'react';
import { VOLATILITY, CONTRACTS, contractInfo, lastDigit } from '../lib/markets.js';
import { deriv } from '../lib/deriv.js';
import { useSession, useTicks, useLedger } from '../lib/session.jsx';
import { ledger, nextTick, placeContract } from '../lib/trader.js';
import { DigitCircles, Field, MarketSelect, money } from '../components/ui.jsx';

const MODES = [
  { id: 'single', label: 'Single Fast', desc: 'One contract per round' },
  { id: 'bulk', label: 'Bulk', desc: 'N contracts at once each round' },
  { id: 'hedge', label: 'Hedge', desc: 'Rise + Fall together each round' },
  { id: 'multi', label: 'Multi-Market', desc: 'Trade the market with the strongest edge' },
  { id: 'eo', label: 'Even/Odd Strategy', desc: 'Trade against the last-20 parity majority' },
];

const MAX_OPEN = 10;

export default function SpeedLab() {
  const { account, status, confirmTrading } = useSession();
  const { running } = useLedger();
  const [mode, setMode] = useState('single');
  const [symbol, setSymbol] = useState('R_10');
  const [contract, setContract] = useState('DIGITOVER');
  const [barrier, setBarrier] = useState(2);
  const [stake, setStake] = useState(1);
  const [duration, setDuration] = useState(1);
  const [bulkCount, setBulkCount] = useState(3);
  const [everyTick, setEveryTick] = useState(false);
  const [mart, setMart] = useState({ on: false, factor: 2, maxSteps: 5 });
  const [limits, setLimits] = useState({ tp: 10, sl: 20, maxRuns: 100 });
  const [active, setActive] = useState(false);
  const [session, setSession] = useState({ pnl: 0, runs: 0 });
  const stopRef = useRef(false);
  const { buffer, loading, decimals } = useTicks(symbol, 1000);
  const info = contractInfo(contract);

  const pickMultiMarket = async () => {
    // Highest share of digits satisfying the chosen digit contract over the last 200 ticks.
    const scored = await Promise.all(VOLATILITY.map(async (m) => {
      const h = await deriv.ticksHistory(m.value, 200);
      const ds = h.prices.map((p) => lastDigit(p, h.pipSize ?? m.decimals));
      const hit = {
        DIGITOVER: (d) => d > barrier, DIGITUNDER: (d) => d < barrier, DIGITEVEN: (d) => d % 2 === 0,
        DIGITODD: (d) => d % 2 === 1, DIGITMATCH: (d) => d === barrier, DIGITDIFF: (d) => d !== barrier,
      }[contract] ?? (() => true);
      return { symbol: m.value, score: ds.filter(hit).length / (ds.length || 1) };
    }));
    return scored.sort((a, b) => b.score - a.score)[0].symbol;
  };

  const start = async () => {
    const summary = `Speed Lab ${MODES.find((m) => m.id === mode).label}: ${info.label}${info.barrier ? ` ${barrier}` : ''}, stake ${money(stake)}, TP ${limits.tp} / SL ${limits.sl}, max ${limits.maxRuns} rounds.`;
    const ok = await confirmTrading(summary).catch((e) => { ledger.log(e.message, 'error'); return false; });
    if (!ok) return;

    stopRef.current = false;
    setActive(true);
    ledger.setRunning({ source: 'speed lab', symbol });
    let pnl = 0; let runs = 0; let step = 0; let open = 0;
    const currency = account?.currency ?? 'USD';

    const onSettled = (results) => {
      const p = results.reduce((s, r) => s + (r.status === 'fulfilled' ? r.value.profit : 0), 0);
      pnl += p; runs += 1;
      step = p > 0 || !mart.on ? 0 : Math.min(step + 1, mart.maxSteps);
      setSession({ pnl, runs });
      if (pnl >= limits.tp) { ledger.log(`Speed Lab take profit ${limits.tp} reached`, 'success'); stopRef.current = true; }
      if (pnl <= -Math.abs(limits.sl)) { ledger.log(`Speed Lab stop loss ${limits.sl} reached`, 'error'); stopRef.current = true; }
      if (runs >= limits.maxRuns) stopRef.current = true;
    };

    const round = async () => {
      const amt = Number((stake * (mart.on ? mart.factor ** step : 1)).toFixed(2));
      const base = { symbol, contract, stake: amt, duration, barrier, currency };
      let orders;
      if (mode === 'hedge') orders = [{ ...base, contract: 'CALL' }, { ...base, contract: 'PUT' }];
      else if (mode === 'bulk') orders = Array.from({ length: bulkCount }, () => base);
      else if (mode === 'multi') orders = [{ ...base, symbol: await pickMultiMarket() }];
      else if (mode === 'eo') {
        const evenShare = buffer.digits(20).filter((d) => d % 2 === 0).length / 20;
        orders = [{ ...base, contract: evenShare > 0.5 ? 'DIGITODD' : 'DIGITEVEN' }];
      } else orders = [base];
      open += 1;
      const settled = Promise.allSettled(orders.map((o) => placeContract(o, { source: 'speed lab' })))
        .then((r) => { open -= 1; onSettled(r); });
      return settled;
    };

    try {
      while (!stopRef.current) {
        if (everyTick) {
          await nextTick(symbol);
          if (open >= MAX_OPEN) continue;
          round();
        } else {
          await round();
        }
      }
    } catch (e) {
      ledger.log(`Speed Lab stopped: ${e.message}`, 'error');
    } finally {
      setActive(false);
      ledger.setRunning(null);
      ledger.log(`Speed Lab session finished: ${runs} rounds, P/L ${money(pnl)}`);
    }
  };

  return (
    <div className="page speedlab">
      <div className="page-head">
        <div className="page-head__icon">⚡</div>
        <div><h1>Speed Lab</h1><p className="muted">High-frequency trading — watch digits live, trade at speed</p></div>
        <span className={`conn conn--${status}`}>{status === 'open' ? 'Connected' : status}</span>
      </div>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Live digits</h2>
          <div className="row">
            <b className="price">{buffer.last ? buffer.last.quote.toFixed(decimals) : '—'}</b>
            <MarketSelect value={symbol} onChange={setSymbol} markets={VOLATILITY} disabled={active} />
          </div>
        </div>
        <DigitCircles percentages={buffer.percentages()} current={buffer.last?.digit} loading={loading} compact />
        <p className="tiny muted center">Tracking {buffer.length} ticks · cursor marks the latest digit</p>
      </section>

      <div className="mode-grid">
        {MODES.map((m) => (
          <button key={m.id} type="button" disabled={active} className={`mode-card ${mode === m.id ? 'is-active' : ''}`} onClick={() => setMode(m.id)}>
            <strong>{m.label}</strong><small>{m.desc}</small>
          </button>
        ))}
      </div>

      <section className="card">
        <h2 className="section-title">Trade setup</h2>
        <div className="grid-2">
          <Field label="Contract type">
            <select className="input" value={contract} disabled={active || mode === 'hedge' || mode === 'eo'} onChange={(e) => setContract(e.target.value)}>
              {CONTRACTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Barrier (last digit)" hint={info?.barrier ? `Predict last digit ${info.label.toLowerCase()} ${barrier}` : 'Not used by this contract'}>
            <input className="input" type="number" min={0} max={9} value={barrier} disabled={active || !info?.barrier} onChange={(e) => setBarrier(Number(e.target.value))} />
          </Field>
          <Field label="Stake (USD)"><input className="input" type="number" min={0.35} step={0.05} value={stake} disabled={active} onChange={(e) => setStake(Number(e.target.value))} /></Field>
          <Field label="Duration (ticks)"><input className="input" type="number" min={1} max={10} value={duration} disabled={active} onChange={(e) => setDuration(Number(e.target.value))} /></Field>
          {mode === 'bulk' && <Field label="Contracts per round"><input className="input" type="number" min={1} max={20} value={bulkCount} disabled={active} onChange={(e) => setBulkCount(Number(e.target.value))} /></Field>}
        </div>
        <div className="grid-2">
          <label className="check"><input type="checkbox" checked={everyTick} disabled={active} onChange={(e) => setEveryTick(e.target.checked)} /> Trade every tick (don't wait for settlement, max {MAX_OPEN} open)</label>
          <label className="check"><input type="checkbox" checked={mart.on} disabled={active} onChange={(e) => setMart({ ...mart, on: e.target.checked })} /> Martingale on loss</label>
          {mart.on && (
            <>
              <Field label="Multiplier"><input className="input" type="number" min={1} step={0.1} value={mart.factor} disabled={active} onChange={(e) => setMart({ ...mart, factor: Number(e.target.value) })} /></Field>
              <Field label="Max steps"><input className="input" type="number" min={1} max={10} value={mart.maxSteps} disabled={active} onChange={(e) => setMart({ ...mart, maxSteps: Number(e.target.value) })} /></Field>
            </>
          )}
        </div>
        <div className="grid-3">
          <Field label="Take profit"><input className="input" type="number" value={limits.tp} disabled={active} onChange={(e) => setLimits({ ...limits, tp: Number(e.target.value) })} /></Field>
          <Field label="Stop loss"><input className="input" type="number" value={limits.sl} disabled={active} onChange={(e) => setLimits({ ...limits, sl: Number(e.target.value) })} /></Field>
          <Field label="Max rounds"><input className="input" type="number" min={1} value={limits.maxRuns} disabled={active} onChange={(e) => setLimits({ ...limits, maxRuns: Number(e.target.value) })} /></Field>
        </div>
        <div className="row row--between">
          <span className="muted">Session: {session.runs} rounds · P/L <b className={session.pnl >= 0 ? 'pos' : 'neg'}>{money(session.pnl)}</b></span>
          {active
            ? <button type="button" className="btn btn--danger" onClick={() => { stopRef.current = true; }}>Stop</button>
            : <button type="button" className="btn btn--primary" disabled={Boolean(running)} onClick={start}>Start</button>}
        </div>
      </section>
    </div>
  );
}
