// Deriv OAuth 2.0 (authorization code + PKCE) against auth.deriv.com.
// Needs VITE_DERIV_CLIENT_ID (register an app at Deriv with redirect URI <origin>/app).

const AUTH_BASE = import.meta.env?.VITE_DERIV_AUTH_BASE || 'https://auth.deriv.com/oauth2/';
const CLIENT_ID = import.meta.env?.VITE_DERIV_CLIENT_ID || '';
const VERIFIER_KEY = 'th.oauth.verifier';
const STATE_KEY = 'th.oauth.state';

export const oauthEnabled = () => Boolean(CLIENT_ID);
const redirectUri = () => `${window.location.origin}${import.meta.env.BASE_URL}app`;

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

export async function startOAuth() {
  if (!CLIENT_ID) throw new Error('OAuth is not configured (set VITE_DERIV_CLIENT_ID). Use API token login instead.');
  const verifier = randomString();
  const state = randomString();
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const q = new URLSearchParams({
    scope: 'trade',
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(`${AUTH_BASE}auth?${q}`);
}

/** If the URL carries ?code=…&state=…, exchange it for an access token. Returns token or null. */
export async function completeOAuth() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;
  const clean = () => window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const state = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!verifier || params.get('state') !== state) { clean(); throw new Error('Login expired or was tampered with. Please try again.'); }

  const res = await fetch(`${AUTH_BASE}token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: CLIENT_ID, redirect_uri: redirectUri(), code_verifier: verifier }),
  });
  const body = await res.json().catch(() => ({}));
  clean();
  if (!res.ok || body.error) throw new Error(body.error_description || body.error || 'Token exchange failed');
  return body.access_token;
}
