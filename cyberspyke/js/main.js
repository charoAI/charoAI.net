// CYBERSPYKE — boot sequence and wiring.

import { game } from './state.js';
import { procs } from './procs.js';
import { Terminal } from './terminal.js';
import { Editor } from './editor.js';
import { Lessons } from './lessons.js';
import { Intro } from './intro.js';
import { UI } from './ui.js';
import { fmtMoney } from './util.js';

async function boot() {
  const offline = game.load();

  // Title screen goes up immediately; the game finishes booting behind it.
  const intro = new Intro({
    onNewGame: () => { procs.killAll(); game.reset(); },
  });
  const introDone = intro.show();

  await procs.init();

  const ui = new UI();

  const ctx = {
    toast: (msg, cls) => ui.toast(msg, cls),
    openEditor: (file) => { ui.showTab('workspace'); editor.open(file); },
    showTab: (name) => ui.showTab(name),
    openMenu: () => {
      intro.show({ returning: true }).then((action) => handleMenu(action));
    },
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

  ui.onShowTab = (name) => { if (name === 'workspace') terminal.focus(); };
  document.getElementById('ws-terminal').addEventListener('click', (e) => {
    if (window.getSelection()?.toString()) return; // don't steal a text selection
    terminal.focus();
  });
  setupSplit();

  function handleMenu(action) {
    if (action === 'lessons') ui.showTab('lessons');
    else if (action === 'docs') ui.showTab('docs');
    else if (action === 'new') {
      terminal.host = 'home';
      terminal.updatePrompt();
      ui.showTab('workspace'); // Begin Operation drops you at the keyboard
      terminal.focus();
    } else { ui.showTab('workspace'); terminal.focus(); }
  }
  introDone.then(handleMenu);
  document.querySelector('.brand').addEventListener('click', () => ctx.openMenu());

  // Drag the divider between editor and terminal to resize (desktop only).
  function setupSplit() {
    const ws = document.getElementById('workspace');
    const divider = document.getElementById('ws-divider');
    const editorPane = ws.querySelector('.ws-editor');
    let dragging = false;
    divider.addEventListener('pointerdown', (e) => {
      if (window.matchMedia('(max-width: 720px)').matches) return;
      dragging = true;
      divider.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    divider.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = ws.getBoundingClientRect();
      const pct = Math.max(25, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100));
      editorPane.style.flex = `0 0 ${pct}%`;
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { divider.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    divider.addEventListener('pointerup', end);
    divider.addEventListener('pointercancel', end);
  }

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
  window.__cyberspyke = { game, procs };

  // The blocking script bridge needs cross-origin isolation (SharedArrayBuffer).
  if (!crossOriginIsolated) {
    ui.toast('script engine offline: not cross-origin isolated — see Docs › Troubleshooting', 'err');
    document.getElementById('coi-warning')?.classList.add('visible');
  }

  terminal.focus();
}

boot();
