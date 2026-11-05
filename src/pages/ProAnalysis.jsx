// Pro Analysis: a blue "trading dashboard" view of live digit statistics.
// Every number comes from real Deriv ticks. The analysis panel reports what the data
// actually shows and the contract's true odds; it does not invent predictions.

import { useRef, useState } from 'react';
import { MARKETS, marketBySymbol, contractInfo } from '../lib/markets.js';
import { useSession, useTicks } from '../lib/session.jsx';
import { ledger, placeContract } from '../lib/trader.js';
import { uniformityTest, winProbability, describeP } from '../lib/stats.js';
import { money } from '../components/ui.jsx';

const STRATEGIES = [
  { id: 'even_odd', label: 'Even/Odd', contracts: ['DIGITEVEN', 'DIGITODD'], digit: false },
  { id: 'matches_differs', label: 'Matches/Differs', contracts: ['DIGITMATCH', 'DIGITDIFF'], digit: true },
  { id: 'over_under', label: 'Over/Under', contracts: ['DIGITOVER', 'DIGITUNDER'], digit: true },
];
const WINDOWS = [100, 200, 500, 1000];

const band = (p) => (p > 12 ? 'high' : p >= 8 ? 'mid' : 'low');

const RULES = [
  { id: 'hot', label: 'Most frequent digit' },
  { id: 'cold', label: 'Least frequent digit' },
  { id: 'repeat', label: 'Repeat last digit' },
];

/** Digit suggested by a simple rule over the live tick window (no hidden scoring). */
function suggestDigit(buffer, rule) {
  if (!buffer.length) return null;
  if (rule === 'repeat') return buffer.last.digit;
  const c = buffer.counts;
  const target = rule === 'hot' ? Math.max(...c) : Math.min(...c);
  return c.indexOf(target);
}

function LiveDashboard({ symbol, windowSize, strategy }) {
  const { account, confirmTrading } = useSession();
  const { buffer, loading, error, decimals } = useTicks(symbol, windowSize);
  const [digit, setDigit] = useState(5);
  const [stake, setStake] = useState(1);
  const [busy, setBusy] = useState(false);
  const [lastTrade, setLastTrade] = useState(null);
  const [rule, setRule] = useState('hot');
  const [auto, setAuto] = useState({ maxTrades: 5, tp: 20, sl: 10 });
  const [session, setSession] = useState(null);   // {trades, wins, pnl, running}
  const stopRef = useRef(false);
  const [notice, setNotice] = useState(null);

  const suggested = suggestDigit(buffer, rule);
  const pct = buffer.percentages();
  const counts = buffer.counts;
  const eo = buffer.evenOdd();
  const last = buffer.last;
  const ranked = pct.map((p, d) => ({ p, d })).sort((a, b) => b.p - a.p);
  const test = uniformityTest(counts);
  const strat = STRATEGIES.find((s) => s.id === strategy);
  const updated = last ? new Date(last.time * 1000).toLocaleTimeString() : '—';

  const facts = (() => {
    if (strategy === 'even_odd') {
      return [
        `Last ${buffer.length} ticks: ${eo.even.toFixed(1)}% even, ${eo.odd.toFixed(1)}% odd.`,
        'Each Even or Odd contract wins 50% of the time regardless of recent ticks — digits are independent.',
      ];
    }
    if (strategy === 'matches_differs') {
      return [
        `Most frequent: digit ${ranked[0].d} at ${ranked[0].p.toFixed(1)}%. Least frequent: digit ${ranked[9].d} at ${ranked[9].p.toFixed(1)}%.`,
        `Matches ${digit} wins 10% of the time; Differs ${digit} wins 90% — but pays far less. A "hot" or "cold" digit does not change the next tick.`,
      ];
    }
    const ou = buffer.overUnder(digit);
    return [
      `Last ${buffer.length} ticks: ${ou.over.toFixed(1)}% over ${digit}, ${ou.equal.toFixed(1)}% equal, ${ou.under.toFixed(1)}% under.`,
      `True odds: Over ${digit} wins ${Math.round(winProbability('DIGITOVER', digit) * 100)}%, Under ${digit} wins ${Math.round(winProbability('DIGITUNDER', digit) * 100)}% of the time.`,
    ];
  })();

  const trade = async (contract) => {
    const info = contractInfo(contract);
    const label = `${info.label}${info.barrier ? ` ${digit}` : ''}`;
    const ok = await confirmTrading(`Buy 1 × ${label} on ${marketBySymbol(symbol).label}, stake ${money(stake)}, 1 tick.`)
      .catch((e) => { ledger.log(e.message, 'error'); setNotice(e.message); return false; });
    if (!ok) return;
    setNotice(null);
    setBusy(true);
    try {
      const r = await placeContract({ symbol, contract, stake, duration: 1, barrier: digit, currency: account?.currency ?? 'USD' }, { source: 'pro analysis' });
      setLastTrade(r);
    } catch (e) {
      ledger.log(`Trade failed: ${e.message}`, 'error');
      setNotice(`Trade failed: ${e.message}`);
    } finally { setBusy(false); }
  };

  // Matches loop: before every trade, take the rule's current digit and buy Matches on it.
  const runMatches = async () => {
    const ruleLabel = RULES.find((r) => r.id === rule).label.toLowerCase();
    const ok = await confirmTrading(
      `Auto-buy up to ${auto.maxTrades} × Matches (${ruleLabel}) on ${marketBySymbol(symbol).label}, stake ${money(stake)} each. `
      + `Each Matches contract wins about 10% of the time. Stops at +${auto.tp} profit or −${auto.sl} loss.`,
    ).catch((e) => { ledger.log(e.message, 'error'); setNotice(e.message); return false; });
    if (!ok) return;
    setNotice(null);
    stopRef.current = false;
    let trades = 0; let wins = 0; let pnl = 0;
    setSession({ trades, wins, pnl, running: true });
    setBusy(true);
    ledger.setRunning({ source: 'pro analysis', symbol });
    try {
      while (!stopRef.current && trades < auto.maxTrades) {
        const d = suggestDigit(buffer, rule);
        if (d == null) break;
        setDigit(d);
        const r = await placeContract({ symbol, contract: 'DIGITMATCH', stake, duration: 1, barrier: d, currency: account?.currency ?? 'USD' }, { source: 'pro analysis' });
        trades += 1; pnl += r.profit; if (r.profit > 0) wins += 1;
        setLastTrade(r);
        setSession({ trades, wins, pnl, running: true });
        if (pnl >= auto.tp) { ledger.log(`Matches run: take profit ${auto.tp} reached`, 'success'); break; }
        if (pnl <= -Math.abs(auto.sl)) { ledger.log(`Matches run: stop loss ${auto.sl} reached`, 'error'); break; }
      }
    } catch (e) {
      ledger.log(`Matches run stopped: ${e.message}`, 'error');
      setNotice(`Matches run stopped: ${e.message}`);
    } finally {
      setSession({ trades, wins, pnl, running: false });
      setBusy(false);
      ledger.setRunning(null);
    }
  };

  const copyDigit = () => { if (suggested != null) navigator.clipboard?.writeText(String(suggested)).catch(() => {}); };

  return (
    <>
      <section className="pa-card">
        <h3 className="pa-title">▮▮ Live Digit Probability</h3>
        <p className="pa-sub">Counted from the last {buffer.length} real ticks · updates every tick</p>
        {error && <p className="pa-error">{error}</p>}
        <div className={`pa-grid ${loading ? 'is-loading' : ''}`}>
          {pct.map((p, d) => (
            <button key={d} type="button" className={`pa-digit pa-digit--${band(p)} ${last?.digit === d ? 'is-current' : ''} ${strat.digit && digit === d ? 'is-picked' : ''}`}
              onClick={() => setDigit(d)} title={`${counts[d]} of ${buffer.length} ticks`}>
              <strong>{d}</strong><small>{p.toFixed(1)}%</small>
              <i style={{ width: `${Math.min(100, (p / 15) * 100)}%` }} />
            </button>
          ))}
        </div>
        <div className="pa-legend">
          <span><i className="dot-current" />Current digit</span>
          <span><i className="dot-high" />High (&gt;12%)</span>
          <span><i className="dot-mid" />Medium (8–12%)</span>
          <span><i className="dot-low" />Low (&lt;8%)</span>
        </div>

        <div className="pa-stats">
          <div><small>Current digit</small><b>{last ? last.digit : '—'}</b></div>
          <div><small>Live price</small><b>{last ? last.quote.toFixed(decimals) : '—'}</b></div>
          <div><small>Total ticks</small><b>{buffer.length}</b></div>
          <div><small>Even / Odd</small><b>{Math.round(eo.even)}% / {100 - Math.round(eo.even)}%</b></div>
          <div><small>Last update</small><b>{updated}</b></div>
          <div><small>Market</small><b>{marketBySymbol(symbol).short}</b></div>
        </div>
      </section>

      <section className="pa-card">
        <h3 className="pa-title">◎ Analysis</h3>
        <div className="pa-engine">
          <div><small>Strategy</small><b>{strat.label}</b></div>
          <div><small>{strat.digit ? 'Digit' : 'Window'}</small><b>{strat.digit ? digit : buffer.length}</b></div>
          <div><small>Randomness test</small><b>p = {test.p.toFixed(3)}</b></div>
        </div>
        <div className="pa-facts">
          {facts.map((f) => <p key={f}>• {f}</p>)}
          <p>• Distribution check (χ² = {test.chi2.toFixed(1)}, 9 df): {describeP(test.p)}.</p>
          <p className="pa-note">No prediction is shown because the data cannot support one: Deriv's volatility digits are generated independently, so past frequencies do not change the next digit's odds.</p>
        </div>
        {strategy === 'matches_differs' && (
          <div className="pa-suggest">
            <div className="pa-suggest__head">
              <select className="pa-select" value={rule} onChange={(e) => setRule(e.target.value)} disabled={session?.running}>
                {RULES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <div className="pa-suggest__digit"><small>Suggested digit</small><b>{suggested ?? '—'}</b></div>
            </div>
            <div className="pa-suggest__row">
              <button type="button" className="pa-mini" disabled={suggested == null || session?.running} onClick={() => setDigit(suggested)}>Use it</button>
              <button type="button" className="pa-mini" disabled={suggested == null} onClick={copyDigit}>Copy</button>
              <span className="pa-odds">Matches {suggested ?? ''} wins ~10% · pays ~9× stake</span>
            </div>
            <div className="pa-suggest__auto">
              <label>Trades <input className="input input--sm" type="number" min={1} max={100} value={auto.maxTrades} disabled={session?.running} onChange={(e) => setAuto({ ...auto, maxTrades: Number(e.target.value) })} /></label>
              <label>Take profit <input className="input input--sm" type="number" min={0} value={auto.tp} disabled={session?.running} onChange={(e) => setAuto({ ...auto, tp: Number(e.target.value) })} /></label>
              <label>Stop loss <input className="input input--sm" type="number" min={0} value={auto.sl} disabled={session?.running} onChange={(e) => setAuto({ ...auto, sl: Number(e.target.value) })} /></label>
            </div>
            {session?.running
              ? <button type="button" className="pa-stop pa-run" onClick={() => { stopRef.current = true; }}>□ Stop after this trade</button>
              : <button type="button" className="pa-start pa-run" disabled={busy || suggested == null} onClick={runMatches}>▷ Run Matches on suggested digit</button>}
            {session && (
              <p className="pa-sub pa-session">
                {session.trades} trades · {session.wins} won · P/L <b className={session.pnl >= 0 ? 'pos' : 'neg'}>{money(session.pnl)}</b>
              </p>
            )}
          </div>
        )}
        {strat.digit && <p className="pa-sub">Tap a digit above to choose the {strategy === 'over_under' ? 'barrier' : 'prediction'} for single trades.</p>}
        <div className="pa-trade">
          <label>Stake <input className="input input--sm" type="number" min={0.35} step={0.05} value={stake} onChange={(e) => setStake(Number(e.target.value))} /></label>
          {strat.contracts.map((c) => {
            const info = contractInfo(c);
            const p = winProbability(c, digit);
            return (
              <button key={c} type="button" className="pa-btn" disabled={busy} onClick={() => trade(c)}>
                {info.label}{info.barrier ? ` ${digit}` : ''} <small>wins {Math.round(p * 100)}%</small>
              </button>
            );
          })}
        </div>
        {notice && <p className="pa-error">{notice}</p>}
        {lastTrade && (
          <p className={`pa-result ${lastTrade.profit > 0 ? 'is-won' : 'is-lost'}`}>
            Last trade: {lastTrade.label} {lastTrade.profit > 0 ? 'won' : 'lost'} {money(lastTrade.profit)}
          </p>
        )}
      </section>

      <section className="pa-card">
        <h3 className="pa-title">▤ Frequency Distribution</h3>
        <p className="pa-sub">Observed share per digit vs the 10% a fair generator expects (dashed line)</p>
        <div className="pa-bars">
          {pct.map((p, d) => (
            <div key={d} className="pa-bar">
              <div className="pa-bar__track">
                <span className="pa-bar__expected" />
                <i className={`pa-bar__fill pa-digit--${band(p)}`} style={{ height: `${Math.min(100, (p / 20) * 100)}%` }} />
              </div>
              <small>{d}</small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function ProAnalysis() {
  const { status, account } = useSession();
  const [symbol, setSymbol] = useState(() => localStorage.getItem('th.pa.symbol') || '1HZ10V');
  const [strategy, setStrategy] = useState('even_odd');
  const [windowSize, setWindowSize] = useState(200);
  const [live, setLive] = useState(false);

  const pick = (s) => { localStorage.setItem('th.pa.symbol', s); setSymbol(s); };
  const connected = live && status === 'open';

  return (
    <div className="pa">
      <div className="pa-wrap">
        <section className="pa-card pa-head">
          <div className="pa-brand">
            <span className="pa-logo">◆</span>
            <div>
              <h2>Pro Analysis</h2>
              <p>Live digit statistics dashboard</p>
              <div className="pa-badges"><span>● Live data</span><span>{account ? (account.account_type === 'demo' ? 'Demo account' : 'Real account') : 'Not logged in'}</span></div>
            </div>
          </div>

          <label className="pa-field"><span>▮ Volatility</span>
            <select className="pa-select" value={symbol} onChange={(e) => pick(e.target.value)}>
              {MARKETS.map((m) => <option key={m.value} value={m.value}>{m.short}</option>)}
            </select>
          </label>
          <label className="pa-field"><span>◎ Strategy</span>
            <select className="pa-select" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              {STRATEGIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="pa-field"><span>▤ Ticks analysed</span>
            <select className="pa-select" value={windowSize} onChange={(e) => setWindowSize(Number(e.target.value))}>
              {WINDOWS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>

          <div className="pa-field"><span>⌁ Connection status</span>
            <div className={`pa-status ${connected ? 'is-on' : ''}`}>{connected ? 'Online · live Deriv feed' : live ? 'Connecting…' : 'Offline'}</div>
          </div>
          <div className="pa-field"><span>◷ Controls</span>
            <div className="pa-controls">
              <button type="button" className="pa-start" disabled={live} onClick={() => setLive(true)}>▷ Start</button>
              <button type="button" className="pa-stop" disabled={!live} onClick={() => setLive(false)}>□ Stop</button>
            </div>
          </div>
        </section>

        {live
          ? <LiveDashboard key={`${symbol}-${windowSize}`} symbol={symbol} windowSize={windowSize} strategy={strategy} />
          : <section className="pa-card"><p className="pa-sub">Press Start to stream live ticks for {marketBySymbol(symbol).label}.</p></section>}
      </div>
    </div>
  );
}
