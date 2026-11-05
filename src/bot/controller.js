// Glue between the Bot Builder workspace, the run panel's Run/Stop button and anything that
// wants to load a strategy (Free Bots, Dashboard import, scanner). Loading never runs a bot.

import { Blockly, compileWorkspace } from './blocks.js';
import { BotRunner } from './runtime.js';
import { emptyWorkspace } from './templates.js';
import { ledger } from '../lib/trader.js';

const SAVED_KEY = 'th.workspace';
let workspace = null;
let pending = null;          // {json, name} waiting for the workspace to mount
let runner = null;
let botName = 'Untitled bot';
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export const botController = {
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  get name() { return botName; },
  get isRunning() { return Boolean(runner?.running); },

  attach(ws) {
    workspace = ws;
    const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVED_KEY)); } catch { return null; } })();
    const next = pending ?? (saved ? { json: saved.json, name: saved.name } : { json: emptyWorkspace(), name: 'Untitled bot' });
    pending = null;
    this.applyJson(next.json, next.name);
    ws.addChangeListener((e) => { if (!e.isUiEvent) this.persist(); });
  },

  detach() { this.persist(); workspace = null; },

  applyJson(json, name) {
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(json, workspace);
    } finally {
      Blockly.Events.enable();
    }
    botName = name;
    workspace.scrollCenter();
    this.persist();
    emit();
  },

  /** Load a workspace JSON (from templates, files or the scanner). Opens it in Bot Builder. */
  load(json, name) {
    if (workspace) this.applyJson(json, name);
    else { pending = { json, name }; emit(); }
    ledger.log(`Loaded "${name}" into Bot Builder — review it, then press Run.`);
    window.location.hash = 'bot_builder';
  },

  loadXmlText(xmlText, name) {
    const dom = Blockly.utils.xml.textToDom(xmlText);
    const tmp = new Blockly.Workspace();
    Blockly.Xml.domToWorkspace(dom, tmp);
    const json = Blockly.serialization.workspaces.save(tmp);
    tmp.dispose();
    this.load(json, name);
  },

  exportXml() {
    if (!workspace) return null;
    return Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(workspace));
  },

  persist() {
    if (!workspace) return;
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify({ name: botName, json: Blockly.serialization.workspaces.save(workspace) }));
    } catch { /* quota or private mode */ }
  },

  compile() {
    if (!workspace) {
      const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null');
      if (!saved) throw new Error('Open Bot Builder and build or load a bot first.');
      const tmp = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(saved.json, tmp);
      try { return compileWorkspace(tmp); } finally { tmp.dispose(); }
    }
    return compileWorkspace(workspace);
  },

  async run({ currency, balance }) {
    if (runner?.running) return;
    const { code, settings } = this.compile();
    runner = new BotRunner({ code, settings, currency, balance });
    emit();
    try { await runner.start(); } finally { emit(); }
  },

  stop() { runner?.stop(); emit(); },
};
