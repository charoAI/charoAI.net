// CYBERSPYKE — cinematic intro: boot log, animated title screen, main menu.
// Self-contained: canvas backdrop, CSS glitch, WebAudio ambience (synthesized,
// no assets). Skippable at every step; returning players land on the menu.

import { game } from './state.js';

const SOUND_KEY = 'cyberspyke_sound';
const SEEN_KEY = 'cyberspyke_seen_intro';
const SKIP_KEY = 'cyberspyke_skip_intro';

const BOOT_LINES = [
  ['RECLAIMER OS v3.1.7 — cold boot', 140, null],
  ['bios:        salvaged rack / dry basement', 110, 'OK'],
  ['power:       municipal tap (unmetered)', 100, 'OK'],
  ['memory:      8192 MB, phosphor-checked', 100, 'OK'],
  ['storage:     3 disks spinning, 1 grieving', 110, 'OK'],
  ['uplink:      listening for the old net…', 650, 'FOUND'],
  ['interpreter: python 3.11 (wasm), preserved intact', 120, 'OK'],
  ['operator:    last session 4,383 days ago', 260, null],
  ['', 90, null],
  ['> the grid remembers you.', 420, null],
];

function hasProgress() {
  const s = game.s;
  return s.xp > 0 || s.money !== 500 || Object.keys(s.files).length > 1
    || s.stats.scriptsCompleted > 0 || game.rootedHosts().length > 1;
}

// ---------------------------------------------------------------------------
// Synthesized ambience: a low detuned pad + UI blips. Nothing loads, nothing
// loops from a file — it's all oscillators.
// ---------------------------------------------------------------------------
class IntroAudio {
  constructor() {
    this.ctx = null;
    this.pad = null;
    this.on = localStorage.getItem(SOUND_KEY) !== 'off';
  }

  ensure() {
    if (!this.on || this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { this.ctx = null; }
  }

  startPad() {
    this.ensure();
    if (!this.ctx || this.pad) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 170;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(gain.gain);
    const oscs = [55, 55.6, 110.3].map((f) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
      return o;
    });
    filter.connect(gain).connect(this.ctx.destination);
    lfo.start();
    this.pad = { gain, oscs, lfo };
  }

  stopPad() {
    if (!this.ctx || !this.pad) return;
    const t = this.ctx.currentTime;
    this.pad.gain.gain.cancelScheduledValues(t);
    this.pad.gain.gain.setValueAtTime(this.pad.gain.gain.value, t);
    this.pad.gain.gain.linearRampToValueAtTime(0, t + 0.8);
    const { oscs, lfo } = this.pad;
    setTimeout(() => { for (const o of oscs) o.stop(); lfo.stop(); }, 900);
    this.pad = null;
  }

  blip(freq = 520, dur = 0.045, vol = 0.03) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  select() { this.blip(392, 0.06); setTimeout(() => this.blip(587, 0.09), 70); }

  setOn(v) {
    this.on = v;
    localStorage.setItem(SOUND_KEY, v ? 'on' : 'off');
    if (v) { this.ensure(); this.startPad(); } else this.stopPad();
  }
}

// ---------------------------------------------------------------------------
// Canvas backdrop: a drifting constellation of dead servers, packets crawling
// the wires that still hold.
// ---------------------------------------------------------------------------
class GridBackdrop {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.nodes = [];
    this.packets = [];
    this.raf = 0;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    const n = Math.min(46, Math.floor(window.innerWidth / 30));
    for (let i = 0; i < n; i++) {
      this.nodes.push({
        x: Math.random() * this.w, y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 0.14, vy: (Math.random() - 0.5) * 0.14,
        r: 1 + Math.random() * 1.6, amber: Math.random() < 0.06,
      });
    }
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  frame() {
    const { g, nodes } = this;
    g.clearRect(0, 0, this.w, this.h);
    const LINK = 150;
    for (const a of nodes) {
      a.x += a.vx; a.y += a.vy;
      if (a.x < -20) a.x = this.w + 20; if (a.x > this.w + 20) a.x = -20;
      if (a.y < -20) a.y = this.h + 20; if (a.y > this.h + 20) a.y = -20;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK * LINK) {
          const alpha = 0.09 * (1 - Math.sqrt(d2) / LINK);
          g.strokeStyle = `rgba(70,224,140,${alpha})`;
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
          if (Math.random() < 0.0004 && this.packets.length < 6) {
            this.packets.push({ a, b, t: 0 });
          }
        }
      }
    }
    for (const n of nodes) {
      g.fillStyle = n.amber ? 'rgba(224,179,74,0.5)' : 'rgba(70,224,140,0.42)';
      g.beginPath(); g.arc(n.x, n.y, n.r, 0, Math.PI * 2); g.fill();
    }
    this.packets = this.packets.filter(p => p.t <= 1);
    for (const p of this.packets) {
      p.t += 0.012;
      const x = p.a.x + (p.b.x - p.a.x) * p.t;
      const y = p.a.y + (p.b.y - p.a.y) * p.t;
      g.fillStyle = 'rgba(140,255,190,0.85)';
      g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
  }
}

// ---------------------------------------------------------------------------
// The intro controller.
// ---------------------------------------------------------------------------
export class Intro {
  constructor(ctx) {
    this.ctx = ctx; // { onNewGame() }
    this.audio = new IntroAudio();
    this.open = false;
  }

  // True while the COI service worker is about to reload the page — show a
  // plain "linking" splash instead of starting a title sequence that a reload
  // will immediately eat.
  aboutToReload() {
    return !window.crossOriginIsolated
      && 'serviceWorker' in navigator
      && !sessionStorage.getItem('cyberspyke-coi-reload');
  }

  // Returns a promise of 'continue' | 'new' | 'lessons' | 'docs'.
  show({ returning = false } = {}) {
    if (this.open) return Promise.resolve('continue');
    if (localStorage.getItem(SKIP_KEY) === '1') return Promise.resolve('continue');
    this.open = true;

    const root = document.getElementById('intro');
    root.innerHTML = `
      <canvas class="intro-canvas"></canvas>
      <div class="intro-scan"></div>
      <div class="intro-stage"></div>
      <div class="intro-skip">enter · skip</div>`;
    root.classList.add('visible');
    this.stage = root.querySelector('.intro-stage');
    this.backdrop = new GridBackdrop(root.querySelector('.intro-canvas'));
    document.activeElement?.blur?.(); // keystrokes belong to the menu, not the game beneath

    if (this.aboutToReload()) {
      this.stage.innerHTML = `<div class="intro-linking">◇ establishing grid link…</div>`;
      root.querySelector('.intro-skip').remove();
      return new Promise(() => {}); // the reload takes it from here
    }

    return new Promise((resolve) => {
      this.resolve = resolve;
      this.skipBoot = false;
      this.onKey = (e) => this.handleKey(e);
      this.onGesture = () => { this.audio.ensure(); this.audio.startPad(); };
      document.addEventListener('keydown', this.onKey, true);
      document.addEventListener('pointerdown', this.onGesture, { once: true });
      document.addEventListener('keydown', this.onGesture, { once: true });

      const seen = localStorage.getItem(SEEN_KEY) === '1';
      if (returning || seen) this.showTitle();
      else this.runBoot().then(() => { if (this.open && !this.menuEl) this.showTitle(); });
    });
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async runBoot() {
    const pre = document.createElement('pre');
    pre.className = 'intro-boot';
    this.stage.appendChild(pre);
    for (const [text, delay, status] of BOOT_LINES) {
      if (this.skipBoot || !this.open) return;
      const line = document.createElement('div');
      line.textContent = text;
      pre.appendChild(line);
      await this.sleep(delay);
      if (status) {
        const s = document.createElement('span');
        s.className = status === 'OK' ? 'ok' : 'found';
        s.textContent = `  [ ${status} ]`;
        line.appendChild(s);
        this.audio.blip(status === 'OK' ? 740 : 520, 0.03, 0.012);
      }
    }
    await this.sleep(650);
  }

  showTitle() {
    localStorage.setItem(SEEN_KEY, '1');
    this.audio.startPad();
    this.stage.innerHTML = `
      <div class="intro-title">
        <div class="intro-logo" data-text="CYBERSPYKE">CYBERSPYKE</div>
        <div class="intro-tag">the old net is listening<span class="cursor">▏</span></div>
        <div class="intro-menu"></div>
        <div class="intro-foot">
          <span>v1.1 · a charoai.net operation</span>
          <span>↑↓ select · enter confirm</span>
        </div>
      </div>`;
    this.menuEl = this.stage.querySelector('.intro-menu');
    this.buildMenu(this.mainMenu());
  }

  mainMenu() {
    const items = [];
    if (hasProgress()) items.push({ id: 'continue', label: 'CONTINUE OPERATION' });
    items.push({ id: 'new', label: hasProgress() ? 'NEW OPERATION' : 'BEGIN OPERATION' });
    items.push({ id: 'lessons', label: 'FIELD TRAINING' });
    items.push({ id: 'docs', label: 'THE ARCHIVE' });
    items.push({ id: 'sound', label: `SOUND · ${this.audio.on ? 'ON' : 'OFF'}` });
    items.push({ id: 'fullscreen', label: 'FULLSCREEN' });
    return items;
  }

  confirmMenu() {
    return [
      { id: 'confirm-no', label: 'KEEP MY RECORD' },
      { id: 'confirm-yes', label: 'ERASE AND BEGIN AGAIN' },
    ];
  }

  buildMenu(items) {
    this.items = items;
    this.sel = 0;
    this.menuEl.innerHTML = '';
    items.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'intro-item';
      div.style.animationDelay = `${i * 70}ms`;
      div.textContent = item.label;
      div.addEventListener('mouseenter', () => { this.sel = i; this.paintMenu(); });
      div.addEventListener('click', () => { this.sel = i; this.activate(); });
      this.menuEl.appendChild(div);
    });
    this.paintMenu();
  }

  paintMenu() {
    [...this.menuEl.children].forEach((el, i) => {
      el.classList.toggle('active', i === this.sel);
      el.textContent = (i === this.sel ? '▸ ' : '') + this.items[i].label;
    });
  }

  handleKey(e) {
    if (!this.open) return;
    e.stopPropagation();
    if (!this.menuEl) { // boot phase: any key skips
      if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
      this.skipBoot = true;
      this.showTitle();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.sel = (this.sel + (e.key === 'ArrowDown' ? 1 : this.items.length - 1)) % this.items.length;
      this.audio.blip(500, 0.03, 0.02);
      this.paintMenu();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.activate();
    } else if (e.key === 'Escape' && hasProgress()) {
      e.preventDefault();
      this.close('continue');
    }
  }

  activate() {
    const item = this.items[this.sel];
    this.audio.select();
    switch (item.id) {
      case 'continue': return this.close('continue');
      case 'new':
        if (hasProgress()) return this.buildMenu(this.confirmMenu());
        return this.close('new');
      case 'confirm-no': return this.buildMenu(this.mainMenu());
      case 'confirm-yes':
        this.ctx.onNewGame();
        return this.close('new');
      case 'lessons': return this.close('lessons');
      case 'docs': return this.close('docs');
      case 'sound':
        this.audio.setOn(!this.audio.on);
        this.items[this.sel].label = `SOUND · ${this.audio.on ? 'ON' : 'OFF'}`;
        return this.paintMenu();
      case 'fullscreen':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.();
        return;
    }
  }

  close(action) {
    if (!this.open) return;
    this.open = false;
    this.menuEl = null;
    document.removeEventListener('keydown', this.onKey, true);
    this.audio.stopPad();
    const root = document.getElementById('intro');
    root.classList.add('closing');
    setTimeout(() => {
      root.classList.remove('visible', 'closing');
      root.innerHTML = '';
      this.backdrop?.destroy();
      this.backdrop = null;
    }, 650);
    this.resolve?.(action);
  }
}
