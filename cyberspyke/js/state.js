// CYBERSPYKE — game state: the save file, mutation helpers, and a tiny event bus.

import {
  SERVER_DEFS, HOSTNAMES, HOME_RAM_BASE, levelFromXp, droneIncome,
} from './servers.js';
import { makeContract, pickTypeForLevel, verifyContract, contractTier } from './contracts.js';

const CONTRACT_CAP = 6;

const SAVE_KEY = 'cyberspyke_save_v1';
const LEGACY_SAVE_KEY = 'netfall_save_v1'; // pre-rename saves migrate silently
const OFFLINE_CAP_SECONDS = 4 * 3600;

const WELCOME_FILE = `# CYBERSPYKE — field notes, entry one.
#
# Twelve years since the Fall. The old net is still out there:
# vending machines billing ghosts, trains running empty and on time,
# server rooms humming for companies that no longer exist.
#
# You are a reclaimer. You speak Python — the last language
# the old world's machines still answer to.
#
# Open the Lessons tab to begin. Or just try running this file.

print("signal check: alive")
print("the old net is listening.")
`;

function freshState() {
  const servers = {};
  for (const host of HOSTNAMES) {
    const def = SERVER_DEFS[host];
    servers[host] = {
      money: Math.floor(def.maxMoney * 0.6),
      sec: def.startSec,
      rooted: host === 'home',
      discovered: host === 'home',
    };
  }
  return {
    version: 1,
    money: 500,
    xp: 0,
    homeRam: HOME_RAM_BASE,
    crackers: [],           // cracker ids owned
    drones: [],             // [{level}]
    servers,
    files: { 'welcome.py': WELCOME_FILE },
    contracts: {                 // host -> {type, host, data, reward, tries}
      dustbox: makeContract(pickTypeForLevel(SERVER_DEFS.dustbox.reqLevel), 'dustbox', SERVER_DEFS.dustbox.reqLevel),
      vendnet: makeContract(pickTypeForLevel(SERVER_DEFS.vendnet.reqLevel), 'vendnet', SERVER_DEFS.vendnet.reqLevel),
    },
    stats: {
      hacksSucceeded: 0, hacksFailed: 0, grows: 0, weakens: 0,
      moneyEarned: 0, scriptsCompleted: 0, scriptsWithArgs: 0,
      remoteRuns: 0, apiScans: 0, apiMoneyChecks: 0, nukes: 0,
      totalOps: 0, contractsSolved: 0, contractsFailed: 0,
    },
    lessonsDone: {},
    eidolonRooted: false,
    lastSeen: Date.now(),
  };
}

class GameState {
  constructor() {
    this.s = freshState();
    this._listeners = {};
    this._dirty = false;
  }

  // -- events ---------------------------------------------------------------
  on(event, fn) { (this._listeners[event] ??= []).push(fn); }
  emit(event, data) {
    for (const fn of this._listeners[event] ?? []) fn(data);
    for (const fn of this._listeners['*'] ?? []) fn(event, data);
  }

  // -- persistence ----------------------------------------------------------
  load() {
    let offlineEarnings = 0;
    try {
      let raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_SAVE_KEY);
        if (raw) localStorage.removeItem(LEGACY_SAVE_KEY);
      }
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.version === 1) {
          const fresh = freshState();
          // Merge so new servers/fields added in updates get sane defaults.
          this.s = { ...fresh, ...saved };
          this.s.stats = { ...fresh.stats, ...(saved.stats ?? {}) };
          this.s.files = { ...fresh.files, ...(saved.files ?? {}) };
          this.s.contracts = saved.contracts ?? {}; // existing saves start with none; the timer refills
          this.s.servers = { ...fresh.servers };
          for (const host of HOSTNAMES) {
            if (saved.servers?.[host]) this.s.servers[host] = { ...fresh.servers[host], ...saved.servers[host] };
          }
          const elapsed = Math.min(Math.max(0, (Date.now() - (saved.lastSeen ?? Date.now())) / 1000), OFFLINE_CAP_SECONDS);
          offlineEarnings = Math.floor(elapsed * this.dronesIncomePerSec());
          if (offlineEarnings > 0) this.addMoney(offlineEarnings, { silent: true });
        }
      }
    } catch (e) {
      console.error('save load failed, starting fresh', e);
      this.s = freshState();
    }
    return offlineEarnings;
  }

  save() {
    this.s.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* storage full/blocked */ }
  }

  reset() {
    localStorage.removeItem(SAVE_KEY);
    this.s = freshState();
    this.emit('reset');
    this.emit('money');
    this.emit('xp');
    this.emit('servers');
    this.emit('files');
  }

  // -- player ---------------------------------------------------------------
  level() { return levelFromXp(this.s.xp).level; }
  levelInfo() { return levelFromXp(this.s.xp); }

  addXp(amount) {
    const before = this.level();
    this.s.xp += amount;
    const after = this.level();
    this.emit('xp');
    if (after > before) this.emit('levelup', after);
  }

  addMoney(amount, { silent = false } = {}) {
    this.s.money += amount;
    if (amount > 0) this.s.stats.moneyEarned += amount;
    if (!silent) this.emit('money');
  }

  trySpend(amount) {
    if (this.s.money < amount) return false;
    this.s.money -= amount;
    this.emit('money');
    return true;
  }

  // -- servers --------------------------------------------------------------
  server(host) { return this.s.servers[host]; }
  def(host) { return SERVER_DEFS[host]; }

  discover(host) {
    const srv = this.s.servers[host];
    if (srv && !srv.discovered) {
      srv.discovered = true;
      this.emit('servers');
    }
  }

  scan(host) {
    const def = SERVER_DEFS[host];
    if (!def) return null;
    for (const n of def.neighbors) this.discover(n);
    return [...def.neighbors];
  }

  discoveredHosts() {
    return HOSTNAMES.filter(h => this.s.servers[h].discovered);
  }

  rootedHosts() {
    return HOSTNAMES.filter(h => this.s.servers[h].rooted);
  }

  nuke(host) {
    const srv = this.s.servers[host];
    const def = SERVER_DEFS[host];
    if (!srv || !srv.discovered) return { ok: false, error: `unknown host: ${host}` };
    if (srv.rooted) return { ok: false, error: `${host}: already rooted` };
    if (this.s.crackers.length < def.ports) {
      return { ok: false, error: `${host}: ${def.ports} lock(s), you hold ${this.s.crackers.length} cracker(s)` };
    }
    srv.rooted = true;
    this.s.stats.nukes += 1;
    this.emit('servers');
    if (host === 'EIDOLON' && !this.s.eidolonRooted) {
      this.s.eidolonRooted = true;
      this.emit('eidolon');
    }
    this.emit('milestone');
    return { ok: true };
  }

  // -- contracts ------------------------------------------------------------
  contractAt(host) { return this.s.contracts[host] ?? null; }

  contractHosts() {
    return HOSTNAMES.filter(h => this.s.contracts[h] && this.s.servers[h]?.discovered);
  }

  // Add a contract to a random eligible server. Returns the host, or null.
  spawnContract() {
    if (Object.keys(this.s.contracts).length >= CONTRACT_CAP) return null;
    const pool = HOSTNAMES.filter(h =>
      this.s.servers[h].discovered && SERVER_DEFS[h].maxMoney > 0 && !this.s.contracts[h]);
    if (!pool.length) return null;
    const host = pool[Math.floor(Math.random() * pool.length)];
    const req = SERVER_DEFS[host].reqLevel;
    this.s.contracts[host] = makeContract(pickTypeForLevel(req), host, req);
    this.emit('contracts');
    this.emit('milestone');
    return host;
  }

  // Returns {ok, correct, reward?, tries?, failed?} or {ok:false, error}.
  solveContract(host, answer) {
    const c = this.s.contracts[host];
    if (!c) return { ok: false, error: `no contract on ${host}` };
    if (verifyContract(c, answer)) {
      delete this.s.contracts[host];
      this.addMoney(c.reward);
      this.addXp(12 * contractTier(c));
      this.s.stats.contractsSolved += 1;
      this.emit('contracts');
      this.emit('milestone');
      return { ok: true, correct: true, reward: c.reward };
    }
    c.tries -= 1;
    const failed = c.tries <= 0;
    if (failed) { delete this.s.contracts[host]; this.s.stats.contractsFailed += 1; }
    this.emit('contracts');
    this.emit('milestone');
    return { ok: true, correct: false, tries: Math.max(0, c.tries), failed };
  }

  // -- drones ---------------------------------------------------------------
  dronesIncomePerSec() {
    return this.s.drones.reduce((sum, d) => sum + droneIncome(d.level), 0);
  }

  // -- files ----------------------------------------------------------------
  writeFile(name, content) {
    this.s.files[name] = content;
    this.emit('files');
  }
  deleteFile(name) {
    delete this.s.files[name];
    this.emit('files');
  }

  bumpStat(key, by = 1) {
    this.s.stats[key] = (this.s.stats[key] ?? 0) + by;
    this.emit('milestone');
  }
}

export const game = new GameState();
