// App-wide session: market-data connection status, login (personal access token or OAuth PKCE),
// account list + switcher, the per-account trading socket, live balance, display currency and
// the trade-confirmation gate. The token stays in this browser and is only sent to Deriv.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { deriv, trading, fetchAccounts } from './deriv.js';
import { completeOAuth } from './auth.js';
import { ledger } from './trader.js';
import { TickBuffer, marketBySymbol, lastDigit } from './markets.js';

const TOKEN_KEY = 'th.token';
const ACTIVE_KEY = 'th.activeAccount';
const CURRENCY_KEY = 'th.displayCurrency';
const UGX_RATE_KEY = 'th.usdUgxRate';      // {rate, ts}
const UGX_FALLBACK = 4068;                  // USD→UGX on 2026-11-05, used until a live rate loads
const RATE_TTL_MS = 12 * 60 * 60 * 1000;

const readRate = () => {
  try { const r = JSON.parse(localStorage.getItem(UGX_RATE_KEY)); return r?.rate > 0 ? r : null; } catch { return null; }
};

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [status, setStatus] = useState(deriv.status);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [accounts, setAccounts] = useState([]);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY));
  const [balance, setBalance] = useState(null);
  const [tradingStatus, setTradingStatus] = useState('idle');
  const [authError, setAuthError] = useState(null);
  const [displayCurrency, setDisplayCurrency] = useState(() => (localStorage.getItem(CURRENCY_KEY) === 'UGX' ? 'UGX' : 'USD'));
  const [ugxRate, setUgxRate] = useState(() => readRate()?.rate ?? UGX_FALLBACK);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const confirmedThisSession = useRef(false);

  useEffect(() => { deriv.connect(); return deriv.onStatus(setStatus); }, []);

  // Live USD→UGX rate for the display toggle, cached for 12 hours.
  useEffect(() => {
    const cached = readRate();
    if (cached && Date.now() - cached.ts < RATE_TTL_MS) return;
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((r) => r.json())
      .then((j) => {
        const rate = Number(j?.rates?.UGX);
        if (rate > 0) { localStorage.setItem(UGX_RATE_KEY, JSON.stringify({ rate, ts: Date.now() })); setUgxRate(rate); }
      })
      .catch(() => { /* keep cached / fallback rate */ });
  }, []);

  // Finish an OAuth redirect if we are returning from auth.deriv.com.
  useEffect(() => {
    completeOAuth()
      .then((t) => { if (t) { localStorage.setItem(TOKEN_KEY, t); setToken(t); } })
      .catch((e) => setAuthError(e.message));
  }, []);

  // Token → account list.
  useEffect(() => {
    if (!token) { setAccounts([]); return; }
    let cancelled = false;
    setAuthError(null);
    fetchAccounts(token)
      .then((list) => { if (!cancelled) setAccounts(list); })
      .catch((e) => { if (!cancelled) { setAuthError(e.message); setAccounts([]); } });
    return () => { cancelled = true; };
  }, [token]);

  const account = accounts.find((a) => a.account_id === activeId) ?? accounts.find((a) => a.account_type === 'demo') ?? accounts[0] ?? null;

  // Active account → trading socket + live balance.
  useEffect(() => {
    if (!token || !account) { trading.close(); setBalance(null); setTradingStatus('idle'); return undefined; }
    const client = trading.open(token, account.account_id);
    const offStatus = client.onStatus(setTradingStatus);
    setBalance({ amount: Number(account.balance ?? 0), currency: account.currency });
    const stop = client.subscribe({ balance: 1 }, (m) => {
      if (m.balance) setBalance({ amount: Number(m.balance.balance), currency: m.balance.currency });
    }, (e) => setAuthError(e.message));
    return () => { stop(); offStatus(); };
  }, [token, account?.account_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loginWithToken = useCallback(async (raw) => {
    const t = raw.trim();
    const list = await fetchAccounts(t);
    if (!list.length) throw new Error('No active options accounts found for this token.');
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setAccounts(list);
    return list;
  }, []);

  const switchAccount = useCallback((id) => {
    if (ledger.get().running) { ledger.log('Stop the running bot before switching accounts.', 'error'); return; }
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveId(id);
    confirmedThisSession.current = false;
  }, []);

  const logout = useCallback(() => {
    trading.close();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    setToken(null); setAccounts([]); setActiveId(null); setBalance(null);
  }, []);

  const toggleCurrency = useCallback(() => {
    setDisplayCurrency((c) => { const n = c === 'USD' ? 'UGX' : 'USD'; localStorage.setItem(CURRENCY_KEY, n); return n; });
  }, []);

  const formatMoney = useCallback((usd) => {
    if (displayCurrency === 'UGX') {
      return `${Math.round(usd * ugxRate).toLocaleString('en-UG')} UGX`;
    }
    return `${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  }, [displayCurrency, ugxRate]);

  /**
   * Every trading start goes through here. The first start per session on a demo account — and
   * every start on a real account — needs an explicit confirmation from the user.
   */
  const confirmTrading = useCallback((summary) => {
    if (!account) return Promise.reject(new Error('Log in to a Deriv account first.'));
    const isVirtual = account.account_type === 'demo';
    if (isVirtual && confirmedThisSession.current) return Promise.resolve(true);
    return new Promise((resolve) => {
      setConfirmRequest({
        summary,
        isVirtual,
        loginid: account.account_id,
        resolve: (ok) => { setConfirmRequest(null); if (ok && isVirtual) confirmedThisSession.current = true; resolve(ok); },
      });
    });
  }, [account]);

  const value = useMemo(() => ({
    status, tradingStatus, accounts, account, balance, authError,
    loginWithToken, switchAccount, logout,
    displayCurrency, toggleCurrency, formatMoney, ugxRate,
    confirmTrading, confirmRequest,
  }), [ugxRate, status, tradingStatus, accounts, account, balance, authError, loginWithToken, switchAccount, logout,
    displayCurrency, toggleCurrency, formatMoney, confirmTrading, confirmRequest]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
export const useLedger = () => useSyncExternalStore(ledger.subscribe, ledger.get);

/** Live ticks for a symbol: seeds from history, then streams. Re-renders on every tick. */
export function useTicks(symbol, capacity = 1000) {
  const bufRef = useRef(new TickBuffer(capacity));
  const [, setVersion] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const market = marketBySymbol(symbol);

  useEffect(() => {
    const buf = new TickBuffer(capacity);
    buf.decimals = market.decimals;
    bufRef.current = buf;
    let stop = () => {};
    let cancelled = false;
    setLoading(true); setError(null); setVersion((v) => v + 1);
    deriv.ticksHistory(symbol, capacity)
      .then((h) => {
        if (cancelled) return;
        buf.decimals = h.pipSize ?? market.decimals;
        buf.load(h.prices, h.times, buf.decimals);
        setLoading(false);
        setVersion((v) => v + 1);
        stop = deriv.subscribe({ ticks: symbol }, (m) => {
          if (!m.tick || (buf.last && buf.last.time === m.tick.epoch)) return;
          buf.decimals = m.tick.pip_size ?? buf.decimals;
          const q = Number(m.tick.quote);
          buf.push(m.tick.epoch, q, lastDigit(q, buf.decimals));
          setVersion((v) => v + 1);
        }, (e) => setError(e.message));
      })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; stop(); };
  }, [symbol, capacity]); // eslint-disable-line react-hooks/exhaustive-deps

  return { buffer: bufRef.current, error, loading, decimals: bufRef.current.decimals ?? market.decimals };
}
