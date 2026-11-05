// Deriv "new API" clients.
//   • deriv      – public options WebSocket (market data: ticks, ticks_history, active_symbols)
//   • trading    – per-account authenticated WebSocket opened from a one-time OTP URL
//                  (balance, buy, proposal, proposal_open_contract)
// REST base: https://api.derivws.com/trading/v1/options/  (accounts, accounts/{id}/otp)

const API_BASE = import.meta.env?.VITE_DERIV_API_BASE || 'https://api.derivws.com/trading/v1/';
const ENV_APP_ID = import.meta.env?.VITE_DERIV_APP_ID || '';
const APP_ID_KEY = 'th.derivAppId';
export const PUBLIC_WS = `${API_BASE.replace(/^https?:\/\//, 'wss://')}options/ws/public`;
export const OPTIONS_REST = `${API_BASE}options/`;

// Deriv requires a Deriv-App-ID header on REST calls made with a personal access token.
// Taken from VITE_DERIV_APP_ID, or entered once by the user and kept in this browser.
export const appId = () => {
  if (ENV_APP_ID) return ENV_APP_ID;
  try { return localStorage.getItem(APP_ID_KEY) || ''; } catch { return ''; }
};
export const appIdFromEnv = () => Boolean(ENV_APP_ID);
export const setAppId = (id) => {
  const v = String(id || '').trim();
  try { if (v) localStorage.setItem(APP_ID_KEY, v); else localStorage.removeItem(APP_ID_KEY); } catch { /* ignore */ }
};

export class DerivClient {
  /** @param {() => Promise<string>|string} urlProvider  called on every (re)connect */
  constructor(urlProvider, name) {
    this.urlProvider = urlProvider;
    this.name = name;
    this.ws = null;
    this.reqId = 0;
    this.pending = new Map();      // req_id -> {resolve, reject}
    this.streams = new Map();      // req_id -> {cb, onError, restart}
    this.statusListeners = new Set();
    this.status = 'idle';          // idle | connecting | open | closed | error
    this.openWaiters = [];
    this.retry = 0;
    this.closedByUser = false;
  }

  setStatus(s) {
    this.status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  onStatus(fn) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  async connect() {
    if (this.connecting || (this.ws && this.ws.readyState <= WebSocket.OPEN)) return;
    this.connecting = true;
    this.closedByUser = false;
    this.setStatus('connecting');
    let url;
    try {
      url = await this.urlProvider();
    } catch (e) {
      this.connecting = false;
      this.setStatus('error');
      this.openWaiters.splice(0).forEach((w) => w.reject(e));
      return;
    }
    const ws = new WebSocket(url);
    this.ws = ws;
    this.connecting = false;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      this.openWaiters.splice(0).forEach((w) => w.resolve());
      clearInterval(this.keepAlive);
      this.keepAlive = setInterval(() => this.send({ ping: 1 }).catch(() => {}), 30000);
    };
    ws.onmessage = (ev) => this.handle(JSON.parse(ev.data));
    ws.onclose = () => {
      clearInterval(this.keepAlive);
      this.setStatus('closed');
      for (const { reject } of this.pending.values()) reject(new Error('Connection closed'));
      this.pending.clear();
      const live = [...this.streams.values()];
      this.streams.clear();
      if (this.closedByUser) return;
      const delay = Math.min(15000, 1000 * 2 ** this.retry++);
      setTimeout(() => {
        this.connect();
        live.forEach((s) => s.restart());
      }, delay);
    };
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  waitOpen(timeoutMs = 20000) {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    this.connect();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.name} connection timed out`)), timeoutMs);
      this.openWaiters.push({
        resolve: () => { clearTimeout(t); resolve(); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
    });
  }

  handle(msg) {
    const id = msg.req_id;
    if (id && this.pending.has(id)) {
      const { resolve, reject } = this.pending.get(id);
      this.pending.delete(id);
      if (msg.error) reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
      else resolve(msg);
    }
    if (id && this.streams.has(id)) {
      const s = this.streams.get(id);
      if (msg.error) s.onError?.(msg.error);
      else s.cb(msg);
    }
  }

  async send(payload, timeoutMs = 30000) {
    await this.waitOpen();
    const req_id = ++this.reqId;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(req_id);
        reject(new Error(`Request timed out: ${Object.keys(payload)[0]}`));
      }, timeoutMs);
      this.pending.set(req_id, {
        resolve: (m) => { clearTimeout(t); resolve(m); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      this.ws.send(JSON.stringify({ ...payload, req_id }));
    });
  }

  // Streaming request (ticks, balance, proposal_open_contract). Returns an unsubscribe fn.
  subscribe(payload, cb, onError) {
    let reqId = null;
    let subId = null;
    let stopped = false;
    const start = async () => {
      await this.waitOpen();
      if (stopped) return;
      reqId = ++this.reqId;
      this.streams.set(reqId, {
        cb: (m) => { if (m.subscription?.id) subId = m.subscription.id; cb(m); },
        onError,
        restart: () => { if (!stopped) start().catch((e) => onError?.(e)); },
      });
      this.ws.send(JSON.stringify({ ...payload, subscribe: 1, req_id: reqId }));
    };
    start().catch((e) => onError?.(e));
    return () => {
      stopped = true;
      if (reqId) this.streams.delete(reqId);
      if (subId && this.ws?.readyState === WebSocket.OPEN) this.send({ forget: subId }).catch(() => {});
    };
  }

  async ticksHistory(symbol, count) {
    const r = await this.send({ ticks_history: symbol, end: 'latest', count, style: 'ticks' }, 40000);
    return { prices: (r.history?.prices ?? []).map(Number), times: r.history?.times ?? [], pipSize: r.pip_size };
  }
}

// ---- REST: accounts + OTP ----------------------------------------------------------------

const headers = (token) => {
  const id = appId();
  if (!id) throw new Error('A Deriv App ID is required. Register an app at developers.deriv.com and enter its App ID.');
  return { Authorization: `Bearer ${token}`, 'Deriv-App-ID': id, Accept: 'application/json' };
};

async function restError(res, fallback) {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text);
    return new Error(j.errors?.[0]?.message || j.error?.message || j.message || fallback);
  } catch {
    return new Error(text || fallback);
  }
}

/** [{account_id, account_type: 'demo'|'real', currency, balance, status}] */
export async function fetchAccounts(token) {
  const res = await fetch(`${OPTIONS_REST}accounts`, { headers: headers(token) });
  if (!res.ok) throw await restError(res, `Could not load accounts (${res.status})`);
  const body = await res.json();
  return (body.data ?? []).filter((a) => !a.status || a.status === 'active');
}

/** One-time authenticated WebSocket URL for an account. */
export async function fetchOtpUrl(token, accountId) {
  const res = await fetch(`${OPTIONS_REST}accounts/${encodeURIComponent(accountId)}/otp`, { method: 'POST', headers: headers(token) });
  if (!res.ok) throw await restError(res, `Could not open trading session (${res.status})`);
  const url = (await res.json()).data?.url;
  if (!url) throw new Error('Trading session URL missing from Deriv response');
  return url.replace(/^https?:\/\//, 'wss://');
}

// ---- shared instances ----------------------------------------------------------------------

export const deriv = new DerivClient(() => PUBLIC_WS, 'Market data');

let tradingClient = null;
export const trading = {
  /** Point the trading socket at an account; replaces any previous session. */
  open(token, accountId) {
    tradingClient?.close();
    tradingClient = new DerivClient(() => fetchOtpUrl(token, accountId), 'Trading');
    return tradingClient;
  },
  close() { tradingClient?.close(); tradingClient = null; },
  get client() {
    if (!tradingClient) throw new Error('Log in to a Deriv account to trade.');
    return tradingClient;
  },
  get active() { return Boolean(tradingClient); },
};
