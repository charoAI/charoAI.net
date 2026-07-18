// NETFALL — script process manager. Spawns workers, accounts RAM, and serves
// the blocking API bridge: every `net.*` call from a script lands in
// handleCall(), which applies game rules and (for timed ops) responds only
// after the operation's real-time duration has elapsed.

import { game } from './state.js';
import {
  SERVER_DEFS, MAX_PROCS, scriptRamCost,
  hackTime, growTime, weakenTime, applyHack, applyGrow, applyWeaken,
} from './servers.js';

const SAB_SIZE = 64 * 1024;
const LOG_CAP = 200;

class ProcManager {
  constructor() {
    this.procs = new Map(); // pid -> proc
    this.history = [];      // recently finished procs, newest last (for logs/tracebacks)
    this.nextPid = 1;
    this.netApiSource = null;
  }

  async init() {
    const resp = await fetch(new URL('../py/net_api.py', import.meta.url));
    this.netApiSource = await resp.text();
  }

  ramUsed(host) {
    let used = 0;
    for (const p of this.procs.values()) if (p.host === host) used += p.ram;
    return Math.round(used * 100) / 100;
  }

  ramTotal(host) {
    return host === 'home' ? game.s.homeRam : SERVER_DEFS[host].ram;
  }

  list() {
    return [...this.procs.values()].map(p => ({
      pid: p.pid, script: p.script, host: p.host, args: p.args,
      ram: p.ram, status: p.status, startedAt: p.startedAt,
    }));
  }

  get(pid) { return this.procs.get(pid); }

  // Returns {ok, pid} or {ok:false, error}.
  spawn(script, host, args = []) {
    if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
      return { ok: false, error: 'script engine offline: this browser context is not cross-origin isolated (see Docs > Troubleshooting)' };
    }
    const code = game.s.files[script];
    if (code === undefined) return { ok: false, error: `no such file: ${script}` };
    if (!script.endsWith('.py')) return { ok: false, error: `${script}: only .py files can run` };
    const srv = game.server(host);
    if (!srv || !srv.discovered) return { ok: false, error: `unknown host: ${host}` };
    if (!srv.rooted) return { ok: false, error: `${host}: no root access` };
    if (this.procs.size >= MAX_PROCS) {
      return { ok: false, error: `process table full (${MAX_PROCS} max) — the old net is held together with tape` };
    }
    const ram = scriptRamCost(code);
    const free = this.ramTotal(host) - this.ramUsed(host);
    if (ram > free + 1e-9) {
      return { ok: false, error: `${host}: not enough RAM (${ram}GB needed, ${Math.max(0, Math.round(free * 100) / 100)}GB free)` };
    }

    const pid = this.nextPid++;
    const sab = new SharedArrayBuffer(SAB_SIZE);
    const worker = new Worker(new URL('./worker.js', import.meta.url));
    const proc = {
      pid, script, host, args, ram, worker, sab,
      sig: new Int32Array(sab, 0, 2),
      sabBytes: new Uint8Array(sab, 8),
      status: 'boot', log: [], startedAt: Date.now(), pendingTimeout: null,
    };
    this.procs.set(pid, proc);

    worker.onmessage = (ev) => this.onWorkerMessage(proc, ev.data);
    worker.onerror = (ev) => {
      this.appendLog(proc, `worker error: ${ev.message}`, true);
      this.cleanup(pid, 'error');
    };
    worker.postMessage({
      sab, code, host, args: args.map(String), netApiSource: this.netApiSource,
    });

    if (args.length > 0) game.bumpStat('scriptsWithArgs');
    if (host !== 'home') game.bumpStat('remoteRuns');
    game.emit('procs');
    return { ok: true, pid, ram };
  }

  kill(pid) {
    const proc = this.procs.get(pid);
    if (!proc) return false;
    this.appendLog(proc, '— killed —');
    this.cleanup(pid, 'killed');
    return true;
  }

  killAll() {
    for (const pid of [...this.procs.keys()]) this.kill(pid);
  }

  cleanup(pid, status = 'done') {
    const proc = this.procs.get(pid);
    if (!proc) return;
    if (proc.pendingTimeout) clearTimeout(proc.pendingTimeout);
    proc.worker.terminate();
    this.procs.delete(pid);
    this.history.push({
      pid: proc.pid, script: proc.script, host: proc.host, args: proc.args,
      ram: proc.ram, status, log: proc.log,
    });
    if (this.history.length > 5) this.history.shift();
    game.emit('procs');
  }

  appendLog(proc, text, isError = false) {
    proc.log.push({ t: Date.now(), text, isError });
    if (proc.log.length > LOG_CAP) proc.log.splice(0, proc.log.length - LOG_CAP);
    game.emit('proclog', proc.pid);
  }

  onWorkerMessage(proc, msg) {
    switch (msg.type) {
      case 'running':
        proc.status = 'run';
        game.emit('procs');
        break;
      case 'log':
        this.appendLog(proc, msg.text, msg.isError);
        break;
      case 'call':
        this.handleCall(proc, msg.fn, msg.args);
        break;
      case 'exit':
        this.appendLog(proc, '— finished —');
        game.bumpStat('scriptsCompleted');
        this.cleanup(proc.pid, 'done');
        break;
      case 'error':
        this.appendLog(proc, msg.error, true);
        this.cleanup(proc.pid, 'error');
        break;
    }
  }

  respond(proc, payload) {
    if (!this.procs.has(proc.pid)) return; // killed while op was in flight
    let bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (bytes.length > proc.sabBytes.length) {
      bytes = new TextEncoder().encode(JSON.stringify({ ok: false, error: 'response too large' }));
    }
    proc.sabBytes.set(bytes);
    Atomics.store(proc.sig, 1, bytes.length);
    Atomics.store(proc.sig, 0, 1);
    Atomics.notify(proc.sig, 0);
  }

  respondAfter(proc, seconds, buildPayload) {
    proc.pendingTimeout = setTimeout(() => {
      proc.pendingTimeout = null;
      if (!this.procs.has(proc.pid)) return;
      this.respond(proc, buildPayload());
    }, Math.max(0, seconds * 1000));
  }

  // Validate a hostname argument coming from a script.
  target(name) {
    if (typeof name !== 'string' || !(name in SERVER_DEFS)) {
      return { error: `unknown host: ${String(name)}` };
    }
    const srv = game.server(name);
    if (!srv.discovered) return { error: `unknown host: ${name} (not yet discovered — try net.scan())` };
    return { srv, def: SERVER_DEFS[name] };
  }

  handleCall(proc, fn, args) {
    const fail = (error) => this.respond(proc, { ok: false, error });
    const ok = (value) => this.respond(proc, { ok: true, value: value === undefined ? null : value });

    switch (fn) {
      case 'hack': case 'grow': case 'weaken': {
        const t = this.target(args[0]);
        if (t.error) return fail(t.error);
        const { srv, def } = t;
        if (!srv.rooted) return fail(`${args[0]}: no root access — nuke it first`);
        const level = game.level();
        if (fn === 'hack') {
          if (def.maxMoney <= 0) return fail(`${args[0]}: nothing to take`);
          if (level < def.reqLevel) return fail(`${args[0]}: needs skill ${def.reqLevel} (you: ${level})`);
          const dur = hackTime(srv, def, level);
          this.appendLog(proc, `hack ${args[0]}: working (${dur.toFixed(1)}s)…`);
          return this.respondAfter(proc, dur, () => {
            const r = applyHack(srv, def, game.level());
            game.addXp(r.xp);
            game.bumpStat('totalOps');
            if (r.success) {
              game.addMoney(r.amount);
              game.bumpStat('hacksSucceeded');
              this.appendLog(proc, `hack ${args[0]}: +$${r.amount.toLocaleString()}`);
            } else {
              game.bumpStat('hacksFailed');
              this.appendLog(proc, `hack ${args[0]}: failed (trace scrubbed, no take)`);
            }
            game.emit('servers');
            return { ok: true, value: r.amount };
          });
        }
        if (fn === 'grow') {
          const dur = growTime(srv, def, level);
          this.appendLog(proc, `grow ${args[0]}: working (${dur.toFixed(1)}s)…`);
          return this.respondAfter(proc, dur, () => {
            const r = applyGrow(srv, def, game.level());
            game.addXp(r.xp);
            game.bumpStat('grows');
            game.bumpStat('totalOps');
            game.emit('servers');
            return { ok: true, value: r.money };
          });
        }
        // weaken
        const dur = weakenTime(srv, def, level);
        this.appendLog(proc, `weaken ${args[0]}: working (${dur.toFixed(1)}s)…`);
        return this.respondAfter(proc, dur, () => {
          const r = applyWeaken(srv, def, game.level());
          game.addXp(r.xp);
          game.bumpStat('weakens');
          game.bumpStat('totalOps');
          game.emit('servers');
          return { ok: true, value: Math.round(r.sec * 100) / 100 };
        });
      }

      case 'nuke': {
        const t = this.target(args[0]);
        if (t.error) return fail(t.error);
        const r = game.nuke(args[0]);
        if (!r.ok && !r.error.includes('already rooted')) return fail(r.error);
        return ok(true);
      }

      case 'scan': {
        const t = this.target(args[0]);
        if (t.error) return fail(t.error);
        game.bumpStat('apiScans');
        return ok(game.scan(args[0]));
      }

      case 'server': {
        const t = this.target(args[0]);
        if (t.error) return fail(t.error);
        const { srv, def } = t;
        return ok({
          hostname: args[0],
          money: srv.money, max_money: def.maxMoney,
          security: Math.round(srv.sec * 100) / 100, min_security: def.minSec,
          level_required: def.reqLevel, ports_required: def.ports,
          rooted: srv.rooted,
          ram: this.ramTotal(args[0]), ram_used: this.ramUsed(args[0]),
        });
      }

      case 'servers': return ok(game.discoveredHosts());
      case 'money': game.bumpStat('apiMoneyChecks'); return ok(game.s.money);
      case 'skill': return ok(game.level());

      case 'sleep': {
        const secs = Number(args[0]);
        if (!Number.isFinite(secs) || secs < 0) return fail('sleep: seconds must be a non-negative number');
        return this.respondAfter(proc, Math.min(secs, 3600), () => ({ ok: true, value: null }));
      }

      case 'run': {
        const [script, host, argv] = args;
        const r = this.spawn(String(script), String(host), Array.isArray(argv) ? argv : []);
        if (r.ok) this.appendLog(proc, `run ${script} on ${host}: pid ${r.pid}`);
        else this.appendLog(proc, `run ${script} on ${host}: ${r.error}`, true);
        return ok(r.ok ? r.pid : 0);
      }

      case 'ps': return ok(this.list().map(p => ({ pid: p.pid, script: p.script, host: p.host, args: p.args })));
      case 'kill': return ok(this.kill(Number(args[0])));

      case 'has_root': {
        const t = this.target(args[0]);
        if (t.error) return fail(t.error);
        return ok(t.srv.rooted);
      }

      case 'hack_time': case 'grow_time': case 'weaken_time': {
        const t = this.target(args[0]);
        if (t.error) return fail(t.error);
        const f = { hack_time: hackTime, grow_time: growTime, weaken_time: weakenTime }[fn];
        return ok(Math.round(f(t.srv, t.def, game.level()) * 100) / 100);
      }

      default: return fail(`unknown grid call: ${fn}`);
    }
  }
}

export const procs = new ProcManager();
