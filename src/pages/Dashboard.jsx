// Dashboard: entry points to load or build a bot.

import { botController } from '../bot/controller.js';
import { pickTextFile } from '../lib/files.js';
import { TEMPLATES, buildTemplate } from '../bot/templates.js';

export default function Dashboard() {
  const fromComputer = async () => {
    const file = await pickTextFile('.xml,.json');
    if (!file) return;
    if (file.name.endsWith('.json')) botController.load(JSON.parse(file.text), file.name.replace(/\.json$/, ''));
    else botController.loadXmlText(file.text, file.name.replace(/\.xml$/, ''));
  };

  const tiles = [
    { label: 'My computer', icon: '🖥', onClick: fromComputer },
    { label: 'Bot Builder', icon: '🧩', onClick: () => { window.location.hash = 'bot_builder'; } },
    { label: 'Quick strategy', icon: '⚡', onClick: () => botController.load(buildTemplate(TEMPLATES[0].id), TEMPLATES[0].name) },
    { label: 'Free bots', icon: '🤖', onClick: () => { window.location.hash = 'free_bots'; } },
  ];

  return (
    <div className="page dashboard">
      <h1 className="dashboard__title">Load or build your bot</h1>
      <p className="muted center">Import a bot from your computer, build it from scratch, or start with a quick strategy.</p>
      <div className="tiles">
        {tiles.map((t) => (
          <button key={t.label} type="button" className="tile" onClick={t.onClick}>
            <span className="tile__icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
