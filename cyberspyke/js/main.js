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

  // -- lesson pane: docked beside the editor + terminal, toggled on demand --
  const lessonPane = document.getElementById('ws-lesson');
  const lessonDivider = document.getElementById('ws-divider-lesson');
  const navLessons = document.getElementById('nav-lessons');
  function setLesson(open) {
    lessonPane.hidden = !open;
    lessonDivider.hidden = !open;
    navLessons.classList.toggle('open', open);
  }
  function openLesson() { ui.showTab('workspace'); setLesson(true); }

  const ctx = {
    toast: (msg, cls) => ui.toast(msg, cls),
    openEditor: (file) => { ui.showTab('workspace'); editor.open(file); },
    showTab: (name) => { if (name === 'lessons') openLesson(); else ui.showTab(name); },
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
  navLessons.addEventListener('click', () => {
    const open = lessonPane.hidden; // toggle
    ui.showTab('workspace');
    setLesson(open);
  });
  document.getElementById('ws-lesson-close').addEventListener('click', () => setLesson(false));
  makeDivider('ws-divider', '.ws-editor', 220, 260);        // editor | terminal
  makeDivider('ws-divider-lesson', '.ws-lesson', 240, 560); // lesson | (editor+terminal)

  function handleMenu(action) {
    if (action === 'lessons') openLesson();
    else if (action === 'docs') { setLesson(false); ui.showTab('docs'); }
    else if (action === 'new') {
      terminal.host = 'home';
      terminal.updatePrompt();
      setLesson(false);           // Begin Operation: just play
      ui.showTab('workspace');
      terminal.focus();
    } else { ui.showTab('workspace'); terminal.focus(); }
  }
  introDone.then(handleMenu);
  document.querySelector('.brand').addEventListener('click', () => ctx.openMenu());

  // Draggable pane divider: sets the pane's width from the pointer, clamped so
  // neither the pane nor what's to its right collapses. Desktop only.
  function makeDivider(dividerId, paneSelector, minPx, keepRightPx) {
    const ws = document.getElementById('workspace');
    const divider = document.getElementById(dividerId);
    const pane = ws.querySelector(paneSelector);
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
      const paneLeft = pane.getBoundingClientRect().left;
      const wsRight = ws.getBoundingClientRect().right;
      const width = Math.max(minPx, Math.min(wsRight - paneLeft - keepRightPx, e.clientX - paneLeft));
      pane.style.flex = `0 0 ${width}px`;
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

  // Coding contracts surface on the grid over time.
  setInterval(() => {
    const host = game.spawnContract();
    if (host) ui.toast(`a coding contract surfaced on ${host} — type \`contracts\``, 'good');
  }, 75_000);
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
