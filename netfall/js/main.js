// NETFALL — boot sequence and wiring.

import { game } from './state.js';
import { procs } from './procs.js';
import { Terminal } from './terminal.js';
import { Editor } from './editor.js';
import { Lessons } from './lessons.js';
import { UI } from './ui.js';
import { fmtMoney } from './util.js';

async function boot() {
  const offline = game.load();
  await procs.init();

  const ui = new UI();

  const ctx = {
    toast: (msg, cls) => ui.toast(msg, cls),
    openEditor: (file) => { ui.showTab('editor'); editor.open(file); },
    showTab: (name) => ui.showTab(name),
    runFile: (file) => {
      const r = procs.spawn(file, 'home', []);
      if (r.ok) ui.toast(`${file} running (pid ${r.pid})`, 'good');
      else ui.toast(r.error, 'err');
    },
  };

  const editor = new Editor(document.getElementById('editor-root'), ctx);
  const terminal = new Terminal(
    document.getElementById('term-out'),
    document.getElementById('term-in'),
    document.getElementById('term-prompt'),
    ctx,
  );
  new Lessons(document.getElementById('lessons-root'), ctx);

  ui.onShowTab = (name) => { if (name === 'terminal') terminal.focus(); };
  document.getElementById('panel-terminal').addEventListener('click', (e) => {
    if (window.getSelection()?.toString()) return; // don't steal a text selection
    terminal.focus();
  });

  // Drone income + autosave ticks.
  setInterval(() => {
    const income = game.dronesIncomePerSec();
    if (income > 0) game.addMoney(income);
  }, 1000);
  setInterval(() => game.save(), 10_000);
  window.addEventListener('beforeunload', () => game.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });

  if (offline > 0) ui.toast(`your drones reclaimed ${fmtMoney(offline)} while you were gone`, 'good');

  // Dev/test handle (also handy for curious players — it's your save, poke it).
  window.__netfall = { game, procs };

  // The blocking script bridge needs cross-origin isolation (SharedArrayBuffer).
  if (!crossOriginIsolated) {
    ui.toast('script engine offline: not cross-origin isolated — see Docs › Troubleshooting', 'err');
    document.getElementById('coi-warning')?.classList.add('visible');
  }

  terminal.focus();
}

boot();
