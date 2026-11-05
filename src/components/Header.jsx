// Top bar: brand, account switcher with balance + USD/KES display toggle, login entry points.

import { useState } from 'react';
import { useSession } from '../lib/session.jsx';
import { oauthEnabled, startOAuth } from '../lib/auth.js';
import { appId, appIdFromEnv, setAppId } from '../lib/deriv.js';
import { Modal, Field } from './ui.jsx';

export function Brand({ onClick }) {
  return (
    <button type="button" className="brand" onClick={onClick} aria-label="Traders Hub home">
      <span className="brand__mark">TH</span>
      <span className="brand__text">Traders<em>HUB</em></span>
    </button>
  );
}

export function TokenLoginModal({ onClose }) {
  const { loginWithToken } = useSession();
  const [token, setToken] = useState('');
  const [app, setApp] = useState(() => appId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const needsAppId = !appIdFromEnv();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    if (needsAppId) setAppId(app);
    try { await loginWithToken(token); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Login with API token" onClose={onClose} className="modal--narrow">
      <form onSubmit={submit} className="stack">
        <p className="muted">Paste a Deriv personal access token with the <b>Trade</b> scope.</p>
        <Field label="API token">
          <input className="input" autoFocus value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your Deriv API token" />
        </Field>
        {needsAppId && (
          <Field label="Deriv App ID" hint="Required by Deriv for API-token logins. Saved in this browser only.">
            <input className="input" value={app} onChange={(e) => setApp(e.target.value)} placeholder="Your app's ID from developers.deriv.com" />
          </Field>
        )}
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--primary btn--block" disabled={busy || token.trim().length < 10 || (needsAppId && !app.trim())}>
          {busy ? 'Checking…' : 'Login securely'}
        </button>
        <a className="link" href="https://home.deriv.com/dashboard/api-tokens" target="_blank" rel="noreferrer">Get an API token from Deriv</a>
        {needsAppId && <a className="link" href="https://developers.deriv.com/" target="_blank" rel="noreferrer">Register an app to get an App ID</a>}
        <p className="tiny muted">The token is stored only in this browser and is sent only to Deriv's API. Nothing is uploaded to any other server.</p>
      </form>
    </Modal>
  );
}

export function LoginButtons({ className = 'btn btn--ghost', onToken }) {
  const [error, setError] = useState(null);
  return (
    <>
      {oauthEnabled() && (
        <button type="button" className={className} onClick={() => startOAuth().catch((e) => setError(e.message))}>Log in</button>
      )}
      <button type="button" className={className} onClick={onToken}>API Token Login</button>
      {error && <span className="error-text tiny">{error}</span>}
    </>
  );
}

export function Header({ onHome }) {
  const { account, accounts, balance, switchAccount, logout, displayCurrency, toggleCurrency, formatMoney, authError, tradingStatus } = useSession();
  const [tokenOpen, setTokenOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isDemo = account?.account_type === 'demo';

  return (
    <header className="topbar">
      <Brand onClick={onHome} />
      <div className="topbar__right">
        {authError && <span className="error-text tiny">{authError}</span>}
        {account ? (
          <div className="account">
            <button type="button" className="account__chip" onClick={() => setMenuOpen((o) => !o)}>
              <span className={`account__avatar ${isDemo ? 'is-demo' : 'is-real'}`}>{isDemo ? 'D' : 'R'}</span>
              <span className="account__meta">
                <small>{isDemo ? 'Demo account' : 'Real account'} ▾ {tradingStatus !== 'open' && <i className="tiny">({tradingStatus})</i>}</small>
                <strong>{balance ? formatMoney(balance.amount) : '—'}</strong>
              </span>
            </button>
            {menuOpen && (
              <div className="account__menu" onMouseLeave={() => setMenuOpen(false)}>
                {accounts.map((a) => (
                  <button key={a.account_id} type="button" className={`account__item ${a.account_id === account.account_id ? 'is-active' : ''}`}
                    onClick={() => { switchAccount(a.account_id); setMenuOpen(false); }}>
                    <span>{a.account_id}</span><small>{a.account_type} · {a.currency}</small>
                  </button>
                ))}
                <div className="account__row">
                  <span>Display currency</span>
                  <button type="button" className="pill" onClick={toggleCurrency}>{displayCurrency}</button>
                </div>
                <button type="button" className="btn btn--ghost btn--block" onClick={logout}>Log out</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <LoginButtons onToken={() => setTokenOpen(true)} />
            <a className="btn btn--primary topbar__signup" href="https://deriv.com/signup/" target="_blank" rel="noreferrer">Sign up</a>
          </>
        )}
      </div>
      {tokenOpen && <TokenLoginModal onClose={() => setTokenOpen(false)} />}
    </header>
  );
}

export function ConfirmTradingModal() {
  const { confirmRequest } = useSession();
  if (!confirmRequest) return null;
  const { summary, isVirtual, loginid, resolve } = confirmRequest;
  return (
    <Modal title={isVirtual ? 'Start trading on demo?' : 'Start trading with REAL money?'} onClose={() => resolve(false)} className="modal--narrow">
      <div className="stack">
        <p>{summary}</p>
        <p className={isVirtual ? 'muted' : 'error-text'}>
          Account <b>{loginid}</b> — {isVirtual ? 'virtual funds.' : 'real funds will be used and can be lost.'}
        </p>
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => resolve(false)}>Cancel</button>
          <button type="button" className="btn btn--primary" onClick={() => resolve(true)}>Start</button>
        </div>
      </div>
    </Modal>
  );
}
