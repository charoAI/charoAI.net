// NETFALL — code editor: a textarea overlaid on a highlighted <pre>, with a
// tiny hand-rolled Python highlighter. No external dependencies.

import { game } from './state.js';
import { scriptRamCost } from './servers.js';
import { fmtRam, escapeHtml } from './util.js';

const KEYWORDS = new Set(('False None True and as assert async await break class continue def del elif else except '
  + 'finally for from global if import in is lambda nonlocal not or pass raise return try while with yield').split(' '));
const BUILTINS = new Set(('print len range int float str bool list dict set tuple abs min max sum sorted enumerate '
  + 'zip map filter round input open type isinstance repr format any all reversed').split(' '));

const TOKEN_RE = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|#[^\n]*|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|[A-Za-z_]\w*)/g;

export function highlightPython(code) {
  let html = '';
  let last = 0;
  let defPending = false;
  for (const m of code.matchAll(TOKEN_RE)) {
    html += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    last = m.index + tok.length;
    let cls = null;
    if (tok.startsWith('#')) cls = 'py-com';
    else if (/^["']/.test(tok)) { cls = 'py-str'; defPending = false; }
    else if (/^\d/.test(tok)) { cls = 'py-num'; defPending = false; }
    else if (KEYWORDS.has(tok)) { cls = 'py-kw'; defPending = (tok === 'def' || tok === 'class'); }
    else if (defPending) { cls = 'py-def'; defPending = false; }
    else if (tok === 'net') cls = 'py-net';
    else if (BUILTINS.has(tok)) cls = 'py-blt';
    html += cls ? `<span class="${cls}">${escapeHtml(tok)}</span>` : escapeHtml(tok);
  }
  html += escapeHtml(code.slice(last));
  return html + '\n'; // trailing newline keeps <pre> height in sync with textarea
}

export class Editor {
  constructor(root, ctx) {
    this.ctx = ctx; // { toast(msg, cls), runFile(name) }
    this.current = null;
    root.innerHTML = `
      <div class="ed-side">
        <div class="ed-side-head">
          <span>files</span>
          <button class="btn" id="ed-new">+ new</button>
        </div>
        <div class="ed-files" id="ed-files"></div>
      </div>
      <div class="ed-main">
        <div class="ed-bar">
          <span id="ed-name" class="ed-name">no file</span>
          <span id="ed-ram" class="ed-ram"></span>
          <span class="ed-spacer"></span>
          <button class="btn btn-accent" id="ed-run">▶ run on home</button>
        </div>
        <div class="ed-wrap">
          <div class="ed-gutter" id="ed-gutter"></div>
          <div class="ed-scroll">
            <pre class="ed-hl" id="ed-hl" aria-hidden="true"></pre>
            <textarea id="ed-ta" class="ed-ta" wrap="off" spellcheck="false" autocapitalize="off"
              autocomplete="off" placeholder="# pick or create a file"></textarea>
          </div>
        </div>
      </div>`;

    this.filesEl = root.querySelector('#ed-files');
    this.nameEl = root.querySelector('#ed-name');
    this.ramEl = root.querySelector('#ed-ram');
    this.hl = root.querySelector('#ed-hl');
    this.ta = root.querySelector('#ed-ta');
    this.gutter = root.querySelector('#ed-gutter');

    root.querySelector('#ed-new').addEventListener('click', () => {
      const name = prompt('new file name (something.py):', 'script.py');
      if (!name) return;
      if (!/^[\w.-]+\.py$/.test(name)) return this.ctx.toast('file names look like: my_script.py', 'err');
      if (game.s.files[name] === undefined) game.writeFile(name, `# ${name}\nimport net\n\n`);
      this.open(name);
    });
    root.querySelector('#ed-run').addEventListener('click', () => {
      if (this.current) this.ctx.runFile(this.current);
    });

    this.ta.addEventListener('input', () => this.onInput());
    this.ta.addEventListener('keydown', (e) => this.onKey(e));
    // The textarea is the scroller; the highlight layer and gutter follow it.
    this.ta.addEventListener('scroll', () => {
      this.hl.style.transform = `translate(${-this.ta.scrollLeft}px, ${-this.ta.scrollTop}px)`;
      this.gutter.scrollTop = this.ta.scrollTop;
    });

    game.on('files', () => { this.renderFiles(); });
    game.on('reset', () => { this.current = null; this.render(); });
    this.renderFiles();
  }

  open(name) {
    this.current = name;
    this.render();
    this.ta.focus();
  }

  render() {
    const body = this.current !== null ? game.s.files[this.current] : undefined;
    this.ta.value = body ?? '';
    this.nameEl.textContent = this.current ?? 'no file';
    this.refreshHighlight();
    this.renderFiles();
  }

  renderFiles() {
    const names = Object.keys(game.s.files).sort();
    this.filesEl.innerHTML = '';
    for (const n of names) {
      const div = document.createElement('div');
      div.className = 'ed-file' + (n === this.current ? ' active' : '');
      div.textContent = n;
      div.addEventListener('click', () => this.open(n));
      this.filesEl.appendChild(div);
    }
    if (this.current && game.s.files[this.current] === undefined) {
      this.current = null;
      this.render();
    }
  }

  onInput() {
    if (this.current === null) return;
    game.s.files[this.current] = this.ta.value; // avoid emit-per-keystroke; files event on blur
    this.refreshHighlight();
  }

  refreshHighlight() {
    const code = this.ta.value;
    this.hl.innerHTML = highlightPython(code);
    const lines = code.split('\n').length;
    this.gutter.innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
    this.ramEl.textContent = this.current ? fmtRam(scriptRamCost(code)) : '';
  }

  onKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      this.insertAtCursor('    ');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const { value, selectionStart } = this.ta;
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const line = value.slice(lineStart, selectionStart);
      const indent = (line.match(/^\s*/) ?? [''])[0];
      const extra = line.trimEnd().endsWith(':') ? '    ' : '';
      this.insertAtCursor('\n' + indent + extra);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      game.save();
      this.ctx.toast('saved', 'good');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (this.current) this.ctx.runFile(this.current);
    }
  }

  insertAtCursor(text) {
    const { selectionStart, selectionEnd } = this.ta;
    this.ta.setRangeText(text, selectionStart, selectionEnd, 'end');
    this.onInput();
  }
}
