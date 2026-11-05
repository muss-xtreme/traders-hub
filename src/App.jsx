// Routing: "/" → landing splash, "/app#<tab>" → trading shell with tab nav, run panel,
// floating scanner and trade-confirmation modal.

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { SessionProvider, useSession } from './lib/session.jsx';
import { Header, ConfirmTradingModal } from './components/Header.jsx';
import { RunPanel } from './components/RunPanel.jsx';
import { ScannerFab } from './components/ScannerFab.jsx';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DCircles from './pages/DCircles.jsx';
import SpeedLab from './pages/SpeedLab.jsx';
import BulkTrader from './pages/BulkTrader.jsx';
import FreeBots from './pages/FreeBots.jsx';
import { Tutorials } from './pages/Info.jsx';
import Charts from './pages/Charts.jsx';
import ProAnalysis from './pages/ProAnalysis.jsx';

const BotBuilder = lazy(() => import('./pages/BotBuilder.jsx'));

// Served from a sub-path on GitHub Pages (e.g. /traders-hub/); "/" in local dev.
const BASE = import.meta.env.BASE_URL;
const APP_PATH = `${BASE}app`;
const isAppPath = () => window.location.pathname.startsWith(APP_PATH);

const TABS = [
  { id: 'free_bots', label: 'Free Bots', icon: '▦', Page: FreeBots },
  { id: 'bulk_trader', label: 'Bulk Trader', icon: '◈', Page: BulkTrader },
  { id: 'dashboard', label: 'Dashboard', icon: '⌂', Page: Dashboard },
  { id: 'bot_builder', label: 'Bot Builder', icon: '⚙', Page: BotBuilder },
  { id: 'dcircles', label: 'DCircles', icon: '◎', Page: DCircles },
  { id: 'speed_lab', label: 'Speed Lab', icon: '⚡', Page: SpeedLab },
  { id: 'pro_analysis', label: 'Pro Analysis', icon: '◆', Page: ProAnalysis },
  { id: 'charts', label: 'Charts', icon: '📈', Page: Charts },
  { id: 'tutorials', label: 'Tutorials', icon: '▷', Page: Tutorials },
];

const tabFromHash = () => {
  const h = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === h) ? h : 'dashboard';
};

function Loader() {
  return (
    <div className="loader">
      <div className="loader__orb">⚡</div>
      <b>TRADERS HUB</b>
      <small>ANALYSE · BUILD · EXECUTE</small>
      <div className="loader__bar"><i /></div>
    </div>
  );
}

function Clock() {
  const { status } = useSession();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <footer className="statusbar">
      <span className={`dot dot--${status}`} title={`Deriv connection: ${status}`} />
      <span>{now.toISOString().replace('T', ' ').slice(0, 19)} GMT</span>
    </footer>
  );
}

const MOBILE_QUERY = '(max-width: 1000px)';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

function Shell({ onHome }) {
  const mobile = useIsMobile();
  const [tab, setTab] = useState(tabFromHash);
  const [panelCollapsed, setPanelCollapsed] = useState(mobile);
  const [booting, setBooting] = useState(true);
  const tabsRef = useRef(null);

  // Phones start with the run panel folded into its bottom bar.
  useEffect(() => { setPanelCollapsed(mobile); }, [mobile]);

  // Keep the active tab visible in the horizontally scrolling nav.
  useEffect(() => {
    tabsRef.current?.querySelector('.tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tab]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    const t = setTimeout(() => setBooting(false), 900);
    return () => { window.removeEventListener('hashchange', onHash); clearTimeout(t); };
  }, []);

  const { Page } = TABS.find((t) => t.id === tab);

  return (
    <div className={`shell ${panelCollapsed ? 'shell--wide' : ''} ${mobile ? 'shell--mobile' : ''}`}>
      <Header onHome={onHome} />
      <nav className="tabs" aria-label="Sections" ref={tabsRef}>
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={`tab ${tab === t.id ? 'is-active' : ''}`}>
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </a>
        ))}
      </nav>
      <main className="shell__main">
        {booting ? <Loader /> : <Suspense fallback={<Loader />}><Page /></Suspense>}
      </main>
      <RunPanel mobile={mobile} collapsed={panelCollapsed} onToggle={() => setPanelCollapsed((c) => !c)} />
      <Clock />
      <ScannerFab />
      <ConfirmTradingModal />
    </div>
  );
}

export default function App() {
  const [inApp, setInApp] = useState(isAppPath);

  useEffect(() => {
    const onPop = () => setInApp(isAppPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (path) => { window.history.pushState({}, '', path); setInApp(path.startsWith(APP_PATH)); };

  return (
    <SessionProvider>
      {inApp ? <Shell onHome={() => go(BASE)} /> : <Landing onEnter={() => go(`${APP_PATH}#free_bots`)} />}
    </SessionProvider>
  );
}
