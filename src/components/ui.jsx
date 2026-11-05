// Shared UI primitives: digit circle rings, modal shell, labelled field, E/O strip.

import { useEffect } from 'react';

const RING = 2 * Math.PI * 22;

/** Ten digit circles with a progress ring proportional to frequency and a cursor on the latest digit. */
export function DigitCircles({ percentages, current, loading, compact = false }) {
  const sorted = [...percentages].map((p, d) => ({ p, d })).sort((a, b) => b.p - a.p);
  const rank = {};
  if (!loading && percentages.some((p) => p > 0)) {
    rank[sorted[0].d] = 'high';
    rank[sorted[1].d] = 'second';
    rank[sorted[9].d] = 'low';
    rank[sorted[8].d] = 'second-low';
  }
  return (
    <div className={`digit-circles${compact ? ' digit-circles--compact' : ''}${loading ? ' is-loading' : ''}`}>
      {percentages.map((p, d) => (
        <div key={d} className={`digit-circle digit-circle--${rank[d] ?? 'plain'}`}>
          <svg viewBox="0 0 52 52" className="digit-circle__ring" aria-hidden="true">
            <circle cx="26" cy="26" r="22" className="digit-circle__track" />
            <circle
              cx="26" cy="26" r="22"
              className="digit-circle__arc"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - Math.min(1, p / 20))}
            />
          </svg>
          <div className="digit-circle__face">
            <strong>{d}</strong>
            <small>{loading ? '…' : `${p.toFixed(compact ? 1 : 2)}%`}</small>
          </div>
          {current === d && <span className="digit-circle__cursor" aria-label="Current digit">▲</span>}
        </div>
      ))}
    </div>
  );
}

export function ParityStrip({ digits, mode = 'eo', barrier = 4 }) {
  return (
    <div className="parity-strip">
      {digits.map((d, i) => {
        let cls; let label;
        if (mode === 'eo') { cls = d % 2 === 0 ? 'even' : 'odd'; label = d % 2 === 0 ? 'E' : 'O'; }
        else if (mode === 'ou') { cls = d > barrier ? 'over' : d < barrier ? 'under' : 'equal'; label = d; }
        else { cls = 'digit'; label = d; }
        return <span key={i} className={`badge badge--${cls}`}>{label}</span>;
      })}
    </div>
  );
}

export function Modal({ title, onClose, children, className = '', dark = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${dark ? 'modal--dark' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__header">
          <h3>{title}</h3>
          {onClose && <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>}
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function MarketSelect({ value, onChange, markets, disabled }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {markets.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );
}

export const money = (n) => Number(n || 0).toFixed(2);
