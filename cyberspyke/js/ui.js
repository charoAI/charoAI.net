// CYBERSPYKE — UI chrome: tabs, topbar, network + scripts panels, toasts.

import { game } from './state.js';
import { procs } from './procs.js';
import { SERVER_DEFS } from './servers.js';
import { fmtMoney, fmtRam, escapeHtml } from './util.js';

export class UI {
  constructor() {
    this.tabs = document.querySelectorAll('.nav-tab');
    this.panels = document.querySelectorAll('.panel');
    this.toastBox = document.getElementById('toasts');
    this.onShowTab = null;

    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    }

    game.on('money', () => this.renderTopbar());
    game.on('xp', () => this.renderTopbar());
    game.on('servers', () => { this.renderTopbar(); this.renderNetwork(); });
    game.on('procs', () => { this.renderTopbar(); this.renderScripts(); });
    game.on('proclog', () => this.renderScripts());
    game.on('reset', () => this.renderAll());
    game.on('levelup', (lvl) => this.toast(`skill level ${lvl}`, 'good'));
    game.on('eidolon', () => this.showVictory());

    setInterval(() => { this.renderTopbar(); }, 1000);
    this.renderAll();
  }

  renderAll() {
    this.renderTopbar();
    this.renderNetwork();
    this.renderScripts();
  }

  showTab(name) {
    for (const tab of this.tabs) tab.classList.toggle('active', tab.dataset.tab === name);
    for (const p of this.panels) p.classList.toggle('active', p.id === `panel-${name}`);
    if (name === 'network') this.renderNetwork();
    if (name === 'scripts') this.renderScripts();
    if (this.onShowTab) this.onShowTab(name);
  }

  renderTopbar() {
    const info = game.levelInfo();
    document.getElementById('tb-money').textContent = fmtMoney(game.s.money);
    document.getElementById('tb-level').textContent = `skill ${info.level}`;
    document.getElementById('tb-xpbar').style.width = `${Math.min(100, (info.into / info.next) * 100)}%`;
    document.getElementById('tb-ram').textContent =
      `${fmtRam(procs.ramUsed('home'))}/${fmtRam(game.s.homeRam)}`;
    document.getElementById('tb-procs').textContent = String(procs.procs.size);
    const income = game.dronesIncomePerSec();
    document.getElementById('tb-income').textContent = income > 0 ? `+${fmtMoney(income)}/s` : '';
  }

  renderNetwork() {
    const box = document.getElementById('network-list');
    if (!box) return;
    const level = game.level();
    box.innerHTML = '';
    for (const host of game.discoveredHosts()) {
      const srv = game.server(host);
      const def = SERVER_DEFS[host];
      const card = document.createElement('div');
      card.className = 'srv-card' + (srv.rooted ? ' rooted' : '');
      const moneyRow = def.maxMoney > 0
        ? `<div class="srv-row"><span>credits</span><span>${fmtMoney(srv.money)} / ${fmtMoney(def.maxMoney)}</span></div>
           <div class="srv-meter"><div style="width:${def.maxMoney ? (srv.money / def.maxMoney) * 100 : 0}%"></div></div>`
        : '';
      card.innerHTML = `
        <div class="srv-head">
          <span class="srv-name">${escapeHtml(host)}</span>
          <span class="srv-tag ${srv.rooted ? 'good' : level >= def.reqLevel ? 'warn' : 'dim'}">
            ${srv.rooted ? 'ROOT' : `${def.ports} lock(s) · skill ${def.reqLevel}`}
          </span>
        </div>
        <div class="srv-desc">${escapeHtml(def.desc)}</div>
        ${moneyRow}
        <div class="srv-row"><span>security</span><span>${srv.sec.toFixed(1)} (floor ${def.minSec})</span></div>
        <div class="srv-row"><span>RAM</span><span>${fmtRam(procs.ramUsed(host))} / ${fmtRam(procs.ramTotal(host))}</span></div>
        <div class="srv-row dim"><span>wired to</span><span>${def.neighbors.filter(n => game.server(n).discovered).map(escapeHtml).join(', ') || '?'}</span></div>`;
      box.appendChild(card);
    }
  }

  renderScripts() {
    const box = document.getElementById('scripts-list');
    if (!box) return;
    const list = procs.list();
    const history = [...procs.history].reverse();
    if (!list.length && !history.length) {
      box.innerHTML = '<p class="dim pad">Nothing running. Start something with <code>run &lt;file.py&gt;</code> in the terminal, or ▶ in the editor.</p>';
      return;
    }
    // Rebuild; logs are small and this panel refreshes on events only.
    box.innerHTML = '';
    for (const p of list) {
      const proc = procs.get(p.pid);
      box.appendChild(this.procCard(p, proc.log, p.status === 'boot' ? 'booting interpreter…' : 'running', true));
    }
    if (history.length) {
      const h = document.createElement('p');
      h.className = 'dim pad';
      h.textContent = 'recently finished:';
      box.appendChild(h);
      for (const p of history) box.appendChild(this.procCard(p, p.log, p.status, false));
    }
  }

  procCard(p, log, statusText, killable) {
    const card = document.createElement('div');
    card.className = 'proc-card' + (killable ? '' : ' proc-hist');
    card.innerHTML = `
      <div class="proc-head">
        <span class="proc-title">pid ${p.pid} · ${escapeHtml(p.script)} ${escapeHtml(p.args.join(' '))}</span>
        <span class="proc-meta">${escapeHtml(p.host)} · ${fmtRam(p.ram)} · ${escapeHtml(statusText)}</span>
        ${killable ? `<button class="btn btn-danger">kill</button>` : ''}
      </div>
      <pre class="proc-log">${log.slice(-12).map(l =>
        `<span class="${l.isError ? 'err' : ''}">${escapeHtml(l.text)}</span>`).join('\n') || '(no output yet)'}</pre>`;
    card.querySelector('button')?.addEventListener('click', () => procs.kill(p.pid));
    return card;
  }

  toast(msg, cls = '') {
    const div = document.createElement('div');
    div.className = `toast ${cls}`;
    div.textContent = msg;
    this.toastBox.appendChild(div);
    setTimeout(() => div.classList.add('show'), 10);
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 400);
    }, 4200);
  }

  showVictory() {
    const overlay = document.createElement('div');
    overlay.className = 'victory';
    overlay.innerHTML = `
      <div class="victory-inner">
        <h1>EIDOLON</h1>
        <p>The locks shear. The oldest process on Earth stops mid-cycle,
        and for the first time in twelve years, something looks <em>back</em> up the wire.</p>
        <p class="dim">A single line arrives on your terminal, in clean Python:</p>
        <pre>raise NotImplementedError("chapter two")</pre>
        <p class="dim">You rooted the thing that ended the world. To be continued.</p>
        <button class="btn btn-accent" id="victory-close">keep playing</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#victory-close').addEventListener('click', () => overlay.remove());
  }
}
