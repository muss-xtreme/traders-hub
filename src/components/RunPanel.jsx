// Right-hand run panel shared by every tab: Run/Stop for the Bot Builder strategy,
// live status, Summary / Transactions / Journal, totals and Reset.

import { useState, useSyncExternalStore } from 'react';
import { useLedger, useSession } from '../lib/session.jsx';
import { ledger } from '../lib/trader.js';
import { botController } from '../bot/controller.js';
import { money } from './ui.jsx';

// On phones (`mobile`), the panel is a bottom bar that expands into a full-height sheet.
export function RunPanel({ collapsed, onToggle, mobile = false }) {
  const { account, balance, confirmTrading } = useSession();
  const { transactions, journal, totals, running, lastResult } = useLedger();
  useSyncExternalStore(botController.subscribe, () => botController.isRunning);
  const [tab, setTab] = useState('summary');
  const [error, setError] = useState(null);
  const botRunning = botController.isRunning;

  const run = async () => {
    setError(null);
    try {
      botController.compile(); // validate before asking for confirmation
      const ok = await confirmTrading(`Run the Bot Builder strategy "${botController.name}".`);
      if (!ok) return;
      await botController.run({ currency: account?.currency ?? 'USD', balance: () => balance?.amount });
    } catch (e) {
      setError(e.message);
    }
  };

  const status = running
    ? `Running · ${running.source}${running.symbol ? ` · ${running.symbol}` : ''}`
    : lastResult ? (lastResult === 'win' ? 'Won ✓' : 'Lost ✗') : 'Bot is not running';

  const runButton = botRunning ? (
    <button type="button" className="run-btn run-btn--stop" onClick={() => botController.stop()}>■ Stop</button>
  ) : (
    <button type="button" className="run-btn" onClick={run} disabled={Boolean(running)}>▶ Run</button>
  );
  const statusBox = <div className={`run-status ${lastResult ? `is-${lastResult}` : ''} ${running ? 'is-running' : ''}`}>{status}</div>;

  if (collapsed && mobile) {
    return (
      <aside className="run-mini">
        {runButton}
        {statusBox}
        <b className={`run-mini__pl ${totals.profit >= 0 ? 'pos' : 'neg'}`}>{money(totals.profit)}</b>
        <button type="button" className="run-mini__open" onClick={onToggle} aria-label="Open run panel">⌃</button>
        {error && <p className="error-text tiny run-mini__error">{error}</p>}
      </aside>
    );
  }

  if (collapsed) {
    return (
      <aside className="run-panel run-panel--collapsed">
        <button type="button" className="run-panel__toggle" onClick={onToggle} aria-label="Open run panel">«</button>
      </aside>
    );
  }

  return (
    <aside className={`run-panel${mobile ? ' run-panel--sheet' : ''}`}>
      <button type="button" className="run-panel__toggle" onClick={onToggle} aria-label="Collapse run panel">{mobile ? '⌄' : '»'}</button>
      <div className="run-panel__head">
        {runButton}
        {statusBox}
      </div>
      {error && <p className="error-text tiny run-panel__error">{error}</p>}

      <nav className="run-tabs">
        {['summary', 'transactions', 'journal'].map((t) => (
          <button key={t} type="button" className={tab === t ? 'is-active' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <div className="run-panel__body">
        {tab === 'summary' && (
          transactions.length === 0 ? (
            <p className="run-empty">When you're ready to trade, hit <b>Run</b>. You'll be able to track your bot's performance here.</p>
          ) : (
            <div className="summary-last">
              {transactions.slice(0, 6).map((t) => (
                <div key={t.id} className={`summary-card is-${t.status}`}>
                  <span>{t.label} · {t.symbol}</span>
                  <strong>{t.status === 'open' ? 'Open' : `${t.profit >= 0 ? '+' : ''}${money(t.profit)}`}</strong>
                </div>
              ))}
            </div>
          )
        )}
        {tab === 'transactions' && (
          <table className="tx-table">
            <thead><tr><th>Type</th><th>Entry/Exit</th><th>Buy</th><th>P/L</th></tr></thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className={`is-${t.status}`}>
                  <td>{t.label}<br /><small>{t.symbol} · {t.source}</small></td>
                  <td><small>{t.entry ?? '—'}<br />{t.exit ?? '—'}</small></td>
                  <td>{money(t.buyPrice)}</td>
                  <td>{t.status === 'open' ? '…' : money(t.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'journal' && (
          <ul className="journal">
            {journal.map((j) => (
              <li key={j.id} className={`is-${j.level}`}>
                <time>{j.time.toLocaleTimeString()}</time> {j.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="run-totals">
        <div><small>Total stake</small><b>{money(totals.stake)}</b></div>
        <div><small>Total payout</small><b>{money(totals.payout)}</b></div>
        <div><small>No. of runs</small><b>{totals.runs}</b></div>
        <div><small>Contracts lost</small><b>{totals.lost}</b></div>
        <div><small>Contracts won</small><b>{totals.won}</b></div>
        <div><small>Total P/L</small><b className={totals.profit >= 0 ? 'pos' : 'neg'}>{money(totals.profit)}</b></div>
      </div>
      <button type="button" className="btn btn--ghost btn--block" onClick={() => ledger.reset()} disabled={Boolean(running)}>Reset</button>
    </aside>
  );
}
