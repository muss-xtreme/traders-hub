// Bot Builder: Blockly workspace with the custom trading block set, toolbar for
// import / export / reset / undo / zoom. Run/Stop lives in the shared run panel.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Blockly, TOOLBOX } from '../bot/blocks.js';
import { botController } from '../bot/controller.js';
import { emptyWorkspace, TEMPLATES, buildTemplate } from '../bot/templates.js';
import { downloadText, pickTextFile } from '../lib/files.js';

const THEME = Blockly.Theme.defineTheme('traders-hub', {
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#fbf7f6',
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#1c1214',
    flyoutBackgroundColour: '#fff3f2',
    flyoutOpacity: 0.96,
    scrollbarColour: '#e8b4b4',
  },
  fontStyle: { family: 'Inter, system-ui, sans-serif', size: 11 },
});

export default function BotBuilder() {
  const host = useRef(null);
  const ws = useRef(null);
  const [error, setError] = useState(null);
  const name = useSyncExternalStore(botController.subscribe, () => botController.name);

  useEffect(() => {
    const workspace = Blockly.inject(host.current, {
      toolbox: TOOLBOX,
      theme: THEME,
      renderer: 'zelos',
      grid: { spacing: 24, length: 2, colour: '#f0dede', snap: true },
      zoom: { controls: false, wheel: true, startScale: 0.8, maxScale: 2, minScale: 0.3 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: false },
    });
    ws.current = workspace;
    botController.attach(workspace);
    const onResize = () => Blockly.svgResize(workspace);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      botController.detach();
      workspace.dispose();
    };
  }, []);

  const importFile = async () => {
    setError(null);
    try {
      const file = await pickTextFile('.xml,.json');
      if (!file) return;
      if (file.name.endsWith('.json')) botController.load(JSON.parse(file.text), file.name.replace(/\.json$/, ''));
      else botController.loadXmlText(file.text, file.name.replace(/\.xml$/, ''));
    } catch (e) { setError(`Could not import: ${e.message}`); }
  };

  const exportFile = () => {
    const xml = botController.exportXml();
    if (xml) downloadText(`${name.replace(/[^\w-]+/g, '_')}.xml`, xml, 'application/xml');
  };

  return (
    <div className="builder">
      <div className="builder__toolbar">
        <select className="input input--sm" value="" onChange={(e) => e.target.value && botController.load(buildTemplate(e.target.value), TEMPLATES.find((t) => t.id === e.target.value).name)}>
          <option value="">Quick strategy…</option>
          {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" className="tool" onClick={() => botController.load(emptyWorkspace(), 'Untitled bot')}>Reset</button>
        <button type="button" className="tool" onClick={importFile}>Import</button>
        <button type="button" className="tool" onClick={exportFile}>Export</button>
        <button type="button" className="tool" onClick={() => ws.current?.cleanUp()}>Sort</button>
        <button type="button" className="tool" onClick={() => ws.current?.undo(false)}>Undo</button>
        <button type="button" className="tool" onClick={() => ws.current?.undo(true)}>Redo</button>
        <button type="button" className="tool" onClick={() => ws.current?.zoomCenter(1)}>Zoom +</button>
        <button type="button" className="tool" onClick={() => ws.current?.zoomCenter(-1)}>Zoom −</button>
        <span className="builder__name">{name}</span>
      </div>
      {error && <p className="notice notice--error">{error}</p>}
      <div ref={host} className="builder__workspace" />
    </div>
  );
}
