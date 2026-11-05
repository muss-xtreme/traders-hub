// Landing splash: glass card, strategy tiles, live connection progress, login entry points
// and a marquee of live volatility prices.

import { useEffect, useState } from 'react';
import { deriv } from '../lib/deriv.js';
import { useSession } from '../lib/session.jsx';
import { oauthEnabled, startOAuth } from '../lib/auth.js';
import { TokenLoginModal } from '../components/Header.jsx';

const TICKER = [['R_10', 'VOL 10'], ['R_25', 'VOL 25'], ['R_50', 'VOL 50'], ['R_75', 'VOL 75'], ['R_100', 'VOL 100'], ['1HZ100V', 'VOL 100 (1s)'], ['JD25', 'JUMP 25']];

function useLiveTicker() {
  const [rows, setRows] = useState({});
  useEffect(() => {
    const first = {};
    const stops = TICKER.map(([s]) => deriv.subscribe({ ticks: s }, (m) => {
      if (!m.tick) return;
      first[s] ??= m.tick.quote;
      setRows((r) => ({ ...r, [s]: { quote: m.tick.quote, pip: m.tick.pip_size, change: ((m.tick.quote - first[s]) / first[s]) * 100 } }));
    }));
    return () => stops.forEach((f) => f());
  }, []);
  return rows;
}

const Bars = ({ seed }) => (
  <svg viewBox="0 0 80 44" className="tile-art" aria-hidden="true">
    {Array.from({ length: 9 }, (_, i) => {
      const h = 10 + ((seed * (i + 3) * 7) % 28);
      return <rect key={i} x={4 + i * 8.4} y={42 - h} width="5.5" height={h} rx="1.5" />;
    })}
  </svg>
);

export default function Landing({ onEnter }) {
  const { status, account } = useSession();
  const [progress, setProgress] = useState(4);
  const [tokenOpen, setTokenOpen] = useState(false);
  const ticker = useLiveTicker();

  useEffect(() => {
    const t = setInterval(() => setProgress((p) => {
      const cap = status === 'open' ? 100 : 88;
      return Math.min(cap, p + (status === 'open' ? 9 : 2));
    }), 120);
    return () => clearInterval(t);
  }, [status]);

  const ready = progress >= 100;
  const items = TICKER.map(([s, label]) => ({ s, label, row: ticker[s] }));

  return (
    <div className="landing">
      <div className="landing__blob landing__blob--a" />
      <div className="landing__blob landing__blob--b" />
      <div className="landing__blob landing__blob--c" />
      <div className="landing__badge"><i /> TRADERS HUB</div>

      <main className="landing__card">
        <div className="landing__logo"><span>TH</span></div>
        <h1 className="landing__title">Traders</h1>
        <div className="landing__sub">HUB</div>
        <p className="landing__tagline">Statistical bots for live volatility markets — analyse, build and execute with control.</p>
        <div className="landing__rule" />

        <div className="landing__tiles">
          <div className="ltile"><span className="ltile__tag">EVEN / ODD</span><Bars seed={3} /><b>PARITY</b></div>
          <div className="ltile"><span className="ltile__tag">OVER / UNDER</span><Bars seed={5} /><b>THRESHOLD</b></div>
          <div className="ltile"><span className="ltile__tag">RISE / FALL</span><Bars seed={7} /><b>MOMENTUM</b></div>
        </div>

        <div className="landing__status"><i className={ready ? 'is-ready' : ''} /> {ready ? 'SECURE CONNECTION READY' : 'ESTABLISHING SECURE CONNECTION…'}</div>
        <div className="landing__progress">
          <small>SECURE</small>
          <div className="landing__bar"><div style={{ width: `${progress}%` }} /></div>
          <b>{progress}%</b>
        </div>

        <div className="landing__actions">
          {account ? (
            <button type="button" className="lbtn lbtn--primary" onClick={onEnter}>CONTINUE AS {account.account_id}</button>
          ) : (
            <button type="button" className="lbtn lbtn--primary" onClick={() => (oauthEnabled() ? startOAuth() : setTokenOpen(true))}>SIGN IN WITH DERIV</button>
          )}
          <button type="button" className="lbtn" onClick={() => setTokenOpen(true)}>API TOKEN LOGIN</button>
          <button type="button" className="lbtn" onClick={onEnter}>ENTER PLATFORM</button>
        </div>
      </main>

      <div className="marquee" aria-label="Live prices">
        <div className="marquee__track">
          {[...items, ...items].map(({ s, label, row }, i) => (
            <span key={`${s}-${i}`} className="marquee__item">
              <b>{label}</b> {row ? row.quote.toFixed(row.pip ?? 2) : '—'}
              {row && <em className={row.change >= 0 ? 'up' : 'down'}>{row.change >= 0 ? '▲' : '▼'}{Math.abs(row.change).toFixed(3)}%</em>}
            </span>
          ))}
        </div>
      </div>
      {tokenOpen && <TokenLoginModal onClose={() => setTokenOpen(false)} />}
    </div>
  );
}
