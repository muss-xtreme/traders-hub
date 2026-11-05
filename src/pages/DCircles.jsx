// DCircles: live last-digit distribution over a rolling 1000-tick window, with Even/Odd and
// Over/Under pattern analysis, rise/fall movement and the raw digit stream.

import { useState } from 'react';
import { MARKETS } from '../lib/markets.js';
import { useTicks } from '../lib/session.jsx';
import { DigitCircles, ParityStrip, MarketSelect } from '../components/ui.jsx';

const SYMBOL_KEY = 'th.dcircles.symbol';

export default function DCircles() {
  const [symbol, setSymbol] = useState(() => localStorage.getItem(SYMBOL_KEY) || 'R_10');
  const [view, setView] = useState('evenodd');
  const [digit, setDigit] = useState(4);
  const { buffer, error, loading, decimals } = useTicks(symbol, 1000);

  const changeSymbol = (s) => { localStorage.setItem(SYMBOL_KEY, s); setSymbol(s); };
  const pct = buffer.percentages();
  const ranked = pct.map((p, d) => ({ p, d })).sort((a, b) => b.p - a.p);
  const eo = buffer.evenOdd();
  const rf = buffer.riseFall();
  const ou = buffer.overUnder(digit);
  const last50 = buffer.digits(50);

  return (
    <div className="page page--narrow dcircles">
      <div className="dc-head card">
        <div>
          <div className="dc-price">{buffer.last ? buffer.last.quote.toFixed(decimals) : '—'}</div>
          <small className="muted">CURRENT PRICE</small>
        </div>
        <label className="dc-market">
          <MarketSelect value={symbol} onChange={changeSymbol} markets={MARKETS} />
          <small className="muted">MARKET</small>
        </label>
      </div>
      {error && <p className="notice notice--error">{error}</p>}

      <section className="card">
        <h2 className="section-title">Digit distribution</h2>
        <DigitCircles percentages={pct} current={buffer.last?.digit} loading={loading} />
        <div className="stat-row">
          <div className="stat stat--high"><small>Highest</small><b>{ranked[0].p.toFixed(2)}%</b></div>
          <div className="stat stat--second"><small>2nd</small><b>{ranked[1].p.toFixed(2)}%</b></div>
          <div className="stat stat--low"><small>Lowest</small><b>{ranked[9].p.toFixed(2)}%</b></div>
          <div className="stat stat--second-low"><small>2nd low</small><b>{ranked[8].p.toFixed(2)}%</b></div>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2 className="section-title">Pattern analysis</h2>
          <div className="toggle">
            <button type="button" className={view === 'evenodd' ? 'is-active' : ''} onClick={() => setView('evenodd')}>Even/Odd</button>
            <button type="button" className={view === 'overunder' ? 'is-active' : ''} onClick={() => setView('overunder')}>Over/Under</button>
          </div>
        </div>
        {view === 'evenodd' ? (
          <>
            <div className="big-split">
              <div className="big-split__a"><b>{eo.even.toFixed(1)}%</b><small>EVEN</small></div>
              <div className="big-split__b"><b>{eo.odd.toFixed(1)}%</b><small>ODD</small></div>
            </div>
            <small className="muted">LAST 50 DIGITS PATTERN</small>
            <ParityStrip digits={last50} mode="eo" />
          </>
        ) : (
          <>
            <small className="muted">SELECT A DIGIT TO ANALYZE</small>
            <div className="digit-picker">
              {Array.from({ length: 10 }, (_, d) => (
                <button key={d} type="button" className={digit === d ? 'is-active' : ''} onClick={() => setDigit(d)}>{d}</button>
              ))}
            </div>
            <div className="big-split big-split--3">
              <div className="big-split__a"><b>{ou.over.toFixed(1)}%</b><small>OVER {digit}</small></div>
              <div className="big-split__eq"><b>{ou.equal.toFixed(1)}%</b><small>EQUAL</small></div>
              <div className="big-split__b"><b>{ou.under.toFixed(1)}%</b><small>UNDER {digit}</small></div>
            </div>
            <ParityStrip digits={last50} mode="ou" barrier={digit} />
          </>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Market movement</h2>
        <div className="big-split">
          <div className="big-split__a"><b>{rf.rise.toFixed(1)}%</b><small>RISE</small></div>
          <div className="big-split__b"><b>{rf.fall.toFixed(1)}%</b><small>FALL</small></div>
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Last digits stream</h2>
        <ParityStrip digits={buffer.digits(100).reverse()} mode="digit" />
      </section>

      <section className="card">
        <h2 className="section-title">Statistics</h2>
        <div className="stat-row">
          <div className="stat"><small>Total ticks</small><b>{buffer.length}</b></div>
          <div className="stat"><small>Pip size</small><b>{decimals}</b></div>
          <div className="stat"><small>Rises</small><b>{buffer.rises}</b></div>
          <div className="stat"><small>Falls</small><b>{buffer.falls}</b></div>
        </div>
      </section>
    </div>
  );
}
