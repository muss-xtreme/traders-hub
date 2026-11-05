// Floating "AI" scanner: draggable orb → module chooser → scan screen.
// The scan is pure statistics over Deriv tick history (see lib/scanner.js). A result can be
// loaded into Bot Builder as an editable strategy; it is never started automatically.

import { useCallback, useEffect, useRef, useState } from 'react';
import { deriv } from '../lib/deriv.js';
import { SCAN_MODES, scanMarkets, clampTicks } from '../lib/scanner.js';
import { contractInfo } from '../lib/markets.js';
import { workspaceFromScan } from '../bot/templates.js';
import { botController } from '../bot/controller.js';
import { Modal, Field } from './ui.jsx';

const POS_KEY = 'th.scanner.fab';
const SETTINGS_KEY = 'th.scanner.settings';
const SIZE = 56;

const clampPos = ({ x, y }) => ({
  x: Math.min(Math.max(8, window.innerWidth - SIZE - 8), Math.max(8, x)),
  y: Math.min(Math.max(8, window.innerHeight - SIZE - 8), Math.max(8, y)),
});

function useDraggable() {
  const [pos, setPos] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem(POS_KEY)); if (p) return clampPos(p); } catch { /* default */ }
    // Default: bottom-right, clear of the run panel on desktop and the run bar on phones.
    const phone = window.innerWidth <= 1000;
    return clampPos({ x: window.innerWidth - SIZE - (phone ? 16 : 320), y: window.innerHeight - SIZE - (phone ? 140 : 60) });
  });
  const drag = useRef(null);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx; const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setPos(clampPos({ x: d.ox + dx, y: d.oy + dy }));
  };
  const onPointerUp = () => {
    const moved = drag.current?.moved;
    drag.current = null;
    if (moved) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    return moved;
  };
  return { pos, onPointerDown, onPointerMove, onPointerUp };
}

function Radar({ state, caption }) {
  return (
    <div className={`radar radar--${state}`}>
      <svg viewBox="0 0 360 170" aria-hidden="true">
        <defs>
          <pattern id="radar-grid" width="18" height="18" patternUnits="userSpaceOnUse">
            <path d="M 18 0 L 0 0 0 18" fill="none" stroke="rgba(56,189,248,.18)" strokeWidth=".8" />
          </pattern>
        </defs>
        <rect width="360" height="170" fill="url(#radar-grid)" />
        <g className="radar__corners" stroke="#38bdf8" strokeWidth="2.4" fill="none">
          <path d="M28 46 V26 H48" /><path d="M332 46 V26 H312" /><path d="M28 124 V144 H48" /><path d="M332 124 V144 H312" />
        </g>
        <g transform="translate(180 72)" className="radar__core">
          <circle r="40" fill="none" stroke="#22d3ee" strokeWidth="1.4" strokeDasharray="3 5" />
          <circle r="22" fill="none" stroke="#22d3ee" strokeOpacity=".5" />
          <line className="radar__beam" x1="0" y1="0" x2="0" y2="-40" stroke="#67e8f9" strokeWidth="2" />
          <circle r="4" fill="#67e8f9" />
        </g>
      </svg>
      <div className="radar__caption">
        <strong>{state === 'found' ? 'MARKET FOUND' : state === 'scanning' ? 'SCANNING' : state === 'none' ? 'NO EDGE FOUND' : 'AWAITING SCAN'}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}

const loadSettings = () => {
  try { return { ticks: 500, stake: 1, martingale: 2, takeProfit: 5, stopLoss: 10, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; } catch { return { ticks: 500, stake: 1, martingale: 2, takeProfit: 5, stopLoss: 10 }; }
};

function ScanScreen({ mode, onBack, onLoaded }) {
  const cfg = SCAN_MODES[mode];
  const [settings, setSettings] = useState(loadSettings);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);       // {best, ranked, scanned, errors}
  const [error, setError] = useState(null);

  const update = (k, v) => setSettings((s) => { const n = { ...s, [k]: v }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(n)); return n; });

  const scan = async () => {
    setScanning(true); setError(null); setResult(null);
    try {
      const r = await scanMarkets(deriv, { mode, ticks: clampTicks(settings.ticks), onProgress: setProgress });
      setResult(r);
    } catch (e) { setError(e.message); } finally { setScanning(false); setProgress(null); }
  };

  const load = () => {
    const best = result.best;
    const label = `${contractInfo(best.contract).label}${best.barrier != null ? ` ${best.barrier}` : ''}`;
    botController.load(workspaceFromScan(best, settings), `${cfg.label}: ${best.marketName} ${label}`);
    onLoaded?.();
  };

  const best = result?.best;
  const radarState = scanning ? 'scanning' : best ? 'found' : result ? 'none' : 'idle';
  const caption = best
    ? `${best.marketName} · ${contractInfo(best.contract).label}${best.barrier != null ? ` ${best.barrier}` : ''}`
    : scanning && progress ? `${progress.current}/${progress.total} — ${progress.label}` : cfg.subtitle;

  return (
    <div className="scan-screen">
      <button type="button" className="link" onClick={onBack}>← Scanner options</button>
      <Radar state={radarState} caption={caption} />
      <div className="grid-2">
        <Field label="Ticks per market (100–5000)">
          <input className="input" type="number" min={100} max={5000} step={50} value={settings.ticks}
            disabled={scanning} onChange={(e) => update('ticks', e.target.value)} onBlur={(e) => update('ticks', clampTicks(e.target.value))} />
        </Field>
        <Field label="Stake (USD)">
          <input className="input" type="number" min={0.35} step={0.05} value={settings.stake} onChange={(e) => update('stake', Number(e.target.value))} />
        </Field>
        <Field label="Martingale ×">
          <input className="input" type="number" min={1} step={0.1} value={settings.martingale} onChange={(e) => update('martingale', Number(e.target.value))} />
        </Field>
        <Field label="Take profit / Stop loss">
          <div className="row">
            <input className="input" type="number" min={0} value={settings.takeProfit} onChange={(e) => update('takeProfit', Number(e.target.value))} />
            <input className="input" type="number" min={0} value={settings.stopLoss} onChange={(e) => update('stopLoss', Number(e.target.value))} />
          </div>
        </Field>
      </div>

      {error && <p className="error-text">{error}</p>}
      {best && <p className="scan-reason">{best.reason} <b>{best.confidence.toFixed(1)}% confidence</b></p>}
      {result && !best && <p className="muted">No market met the {cfg.label} thresholds in {result.scanned} markets. Try again in a minute or with more ticks.</p>}
      {result?.ranked.length > 1 && (
        <ol className="scan-ranked">
          {result.ranked.slice(0, 5).map((r) => (
            <li key={r.symbol}><span>{r.marketName}</span><span>{contractInfo(r.contract).label}{r.barrier != null ? ` ${r.barrier}` : ''}</span><b>{r.confidence.toFixed(1)}%</b></li>
          ))}
        </ol>
      )}

      <div className="row">
        <button type="button" className="btn btn--scan" onClick={scan} disabled={scanning}>{scanning ? 'Scanning…' : 'Scan'}</button>
        <button type="button" className="btn btn--ghost" onClick={load} disabled={!best || scanning}>Load into Bot Builder</button>
      </div>
      <p className="tiny muted">Statistical scan of recent last digits — past distribution does not predict the next tick. Loading a bot never starts it; review it and press Run.</p>
    </div>
  );
}

export function ScannerFab() {
  const { pos, onPointerDown, onPointerMove, onPointerUp } = useDraggable();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const close = useCallback(() => { setOpen(false); setMode(null); }, []);

  return (
    <>
      <button
        type="button"
        className="ai-orb"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { if (!onPointerUp()) setOpen(true); }}
        aria-label="Open AI market scanner"
      >
        <span className="ai-orb__wave" /><span className="ai-orb__wave" /><span className="ai-orb__wave" />
        <span className="ai-orb__core">AI</span>
      </button>

      {open && (
        <Modal title={mode ? SCAN_MODES[mode].label : 'AI COMMAND'} onClose={close} dark className="scanner-modal">
          {mode ? <ScanScreen mode={mode} onBack={() => setMode(null)} onLoaded={close} /> : (
            <div className="scan-chooser">
              <div className="scan-chooser__orb">AI</div>
              <h4>CHOOSE A SCAN</h4>
              {Object.entries(SCAN_MODES).map(([key, m], i) => (
                <button key={key} type="button" className="scan-module" onClick={() => setMode(key)}>
                  <small>MODULE 0{i + 1}</small>
                  <strong>{m.label}</strong>
                  <span>{m.subtitle}</span>
                  <i aria-hidden="true">→</i>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
