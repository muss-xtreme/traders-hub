// Routing: "/" → landing splash, "/app#<tab>" → trading shell with tab nav, run panel,
// floating scanner and trade-confirmation modal.

import { lazy, Suspense, useEffect, useState } from 'react';
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
import { Charts, Tutorials } from './pages/Info.jsx';

const BotBuilder = lazy(() => import('./pages/BotBuilder.jsx'));

const TABS = [
  { id: 'free_bots', label: 'Free Bots', icon: '▦', Page: FreeBots },
  { id: 'bulk_trader', label: 'Bulk Trader', icon: '◈', Page: BulkTrader },
  { id: 'dashboard', label: 'Dashboard', icon: '⌂', Page: Dashboard },
  { id: 'bot_builder', label: 'Bot Builder', icon: '⚙', Page: BotBuilder },
  { id: 'dcircles', label: 'DCircles', icon: '◎', Page: DCircles },
  { id: 'speed_lab', label: 'Speed Lab', icon: '⚡', Page: SpeedLab },
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

function Shell({ onHome }) {
  const [tab, setTab] = useState(tabFromHash);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    const t = setTimeout(() => setBooting(false), 900);
    return () => { window.removeEventListener('hashchange', onHash); clearTimeout(t); };
  }, []);

  const { Page } = TABS.find((t) => t.id === tab);

  return (
    <div className={`shell ${panelCollapsed ? 'shell--wide' : ''}`}>
      <Header onHome={onHome} />
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={`tab ${tab === t.id ? 'is-active' : ''}`}>
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </a>
        ))}
      </nav>
      <main className="shell__main">
        {booting ? <Loader /> : <Suspense fallback={<Loader />}><Page /></Suspense>}
      </main>
      <RunPanel collapsed={panelCollapsed} onToggle={() => setPanelCollapsed((c) => !c)} />
      <Clock />
      <ScannerFab />
      <ConfirmTradingModal />
    </div>
  );
}

export default function App() {
  const [inApp, setInApp] = useState(() => window.location.pathname.startsWith('/app'));

  useEffect(() => {
    const onPop = () => setInApp(window.location.pathname.startsWith('/app'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (path) => { window.history.pushState({}, '', path); setInApp(path.startsWith('/app')); };

  return (
    <SessionProvider>
      {inApp ? <Shell onHome={() => go('/')} /> : <Landing onEnter={() => go('/app#free_bots')} />}
    </SessionProvider>
  );
}
