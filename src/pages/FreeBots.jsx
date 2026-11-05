// Free Bots gallery: original strategy templates that open in Bot Builder.

import { TEMPLATES, buildTemplate } from '../bot/templates.js';
import { botController } from '../bot/controller.js';

export default function FreeBots() {
  return (
    <div className="page">
      <div className="intro card">
        <h1 className="intro__title">Traders Hub</h1>
        <h2>Free bots</h2>
        <p className="muted">Load a strategy into Bot Builder. Every block is editable — check stake, martingale and limits before you press Run.</p>
      </div>
      <div className="bot-grid">
        {TEMPLATES.map((t) => (
          <article key={t.id} className="bot-card" style={{ '--accent': t.accent }}>
            <div className="bot-card__art"><span>{t.tag}</span></div>
            <small className="bot-card__tag">{t.tag}</small>
            <h3>{t.name}</h3>
            <p className="muted tiny">{t.description}</p>
            <button type="button" className="bot-card__btn" onClick={() => botController.load(buildTemplate(t.id), t.name)}>⬇ Load bot</button>
          </article>
        ))}
      </div>
    </div>
  );
}
