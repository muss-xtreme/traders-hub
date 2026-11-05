// Charts (Deriv's public chart app) and Tutorials.

export function Charts() {
  return (
    <div className="page page--full">
      <iframe title="Deriv chart" className="chart-frame" src="https://charts.deriv.com/deriv?hide-signup=true" />
    </div>
  );
}

const GUIDES = [
  ['Log in', 'Use "Log in" (Deriv OAuth) or "API Token Login" with a token that has Read + Trade scopes. Start on a demo account.'],
  ['Analyse', 'DCircles shows the last-digit distribution of the last 1000 ticks, parity, over/under split and rise/fall share.'],
  ['Scan', 'The floating AI orb runs a statistical scan across all volatility indices and suggests one market + contract. It never trades by itself.'],
  ['Build', 'Bot Builder: put a Purchase block in "2. Purchase conditions" and "Trade again" in "3. Restart trading conditions". Use variables for martingale.'],
  ['Run', 'Press Run in the right panel. The first start each session asks for confirmation; real accounts always do. Stop at any time.'],
  ['Trade fast', 'Speed Lab and Bulk Trader place contracts directly — set take-profit, stop-loss and max rounds first.'],
];

export function Tutorials() {
  return (
    <div className="page page--narrow">
      <h1>Tutorials</h1>
      <div className="guide-list">
        {GUIDES.map(([t, d], i) => (
          <article key={t} className="card guide">
            <span className="guide__n">{i + 1}</span>
            <div><h3>{t}</h3><p className="muted">{d}</p></div>
          </article>
        ))}
      </div>
      <p className="tiny muted">Trading binary options and digit contracts carries a high risk of losing your stake. Past tick statistics do not predict future ticks.</p>
    </div>
  );
}
