// NETFALL — the terminal: command parsing and all shell-side interaction.

import { game } from './state.js';
import { procs } from './procs.js';
import {
  SERVER_DEFS, CRACKERS, hackChance, hackTime, growTime, weakenTime,
  homeRamUpgradeCost, HOME_RAM_MAX, droneBuyCost, droneUpgradeCost, droneIncome,
  DRONE_MAX, scriptRamCost,
} from './servers.js';
import { fmtMoney, fmtRam, fmtTime, escapeHtml } from './util.js';

const BANNER = [
  '  _  _ ___ _____ ___ _   _    _    ',
  ' | \\| | __|_   _| __/_\\ | |  | |   ',
  ' | .` | _|  | | | _/ _ \\| |__| |__ ',
  ' |_|\\_|___| |_| |_/_/ \\_\\____|____|',
  '',
  ' reclaimer shell v1.0 — the old net is listening.',
  ' type `help` for commands, or open the Lessons tab to learn the trade.',
];

export class Terminal {
  constructor(outputEl, inputEl, promptEl, ctx) {
    this.out = outputEl;
    this.input = inputEl;
    this.promptEl = promptEl;
    this.ctx = ctx; // { openEditor(file), showTab(name) }
    this.host = 'home';
    this.history = [];
    this.histIdx = -1;

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    for (const line of BANNER) this.println(line, 'dim');
    this.updatePrompt();
  }

  updatePrompt() {
    this.promptEl.textContent = `reclaimer@${this.host}:~$`;
  }

  focus() { this.input.focus(); }

  println(text = '', cls = '') {
    const div = document.createElement('div');
    div.className = `t-line ${cls}`;
    div.textContent = text;
    this.out.appendChild(div);
    this.trim();
  }

  printHtml(html, cls = '') {
    const div = document.createElement('div');
    div.className = `t-line ${cls}`;
    div.innerHTML = html;
    this.out.appendChild(div);
    this.trim();
  }

  trim() {
    while (this.out.children.length > 500) this.out.removeChild(this.out.firstChild);
    this.out.scrollTop = this.out.scrollHeight;
  }

  onKey(e) {
    if (e.key === 'Enter') {
      const line = this.input.value;
      this.input.value = '';
      this.println(`reclaimer@${this.host}:~$ ${line}`, 'echo');
      if (line.trim()) {
        this.history.push(line);
        this.histIdx = this.history.length;
        try { this.exec(line.trim()); } catch (err) { this.println(`shell error: ${err.message}`, 'err'); }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.histIdx > 0) this.input.value = this.history[--this.histIdx] ?? '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.histIdx < this.history.length) this.input.value = this.history[++this.histIdx] ?? '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.complete();
    }
  }

  complete() {
    const parts = this.input.value.split(/\s+/);
    const last = parts[parts.length - 1];
    if (!last) return;
    const pool = parts.length === 1
      ? Object.keys(COMMANDS)
      : [...game.discoveredHosts(), ...Object.keys(game.s.files)];
    const matches = pool.filter(x => x.startsWith(last));
    if (matches.length === 1) {
      parts[parts.length - 1] = matches[0];
      this.input.value = parts.join(' ') + ' ';
    } else if (matches.length > 1) {
      this.println(matches.join('  '), 'dim');
    }
  }

  exec(line) {
    const [cmd, ...args] = line.split(/\s+/);
    const handler = COMMANDS[cmd];
    if (!handler) {
      this.println(`${cmd}: not a command. try \`help\`.`, 'err');
      return;
    }
    handler.fn(this, args);
  }
}

const COMMANDS = {
  help: {
    usage: 'help [command]',
    desc: 'list commands, or explain one',
    fn(t, args) {
      if (args[0]) {
        const c = COMMANDS[args[0]];
        if (!c) return t.println(`no such command: ${args[0]}`, 'err');
        t.println(`${c.usage} — ${c.desc}`);
        return;
      }
      t.println('commands:', 'head');
      const names = Object.keys(COMMANDS);
      for (const n of names) t.println(`  ${COMMANDS[n].usage.padEnd(26)} ${COMMANDS[n].desc}`);
      t.println('');
      t.println('scripts talk to the grid through the `net` module — see the Docs tab.', 'dim');
    },
  },

  scan: {
    usage: 'scan',
    desc: 'list servers wired to this one',
    fn(t) {
      const found = game.scan(t.host);
      t.println(`${t.host} is wired to:`, 'head');
      for (const h of found) {
        const srv = game.server(h);
        const def = SERVER_DEFS[h];
        const tag = srv.rooted ? 'ROOT' : `${def.ports} lock(s), skill ${def.reqLevel}`;
        t.println(`  ${h.padEnd(14)} [${tag}]`);
      }
    },
  },

  connect: {
    usage: 'connect <host>',
    desc: 'hop to a discovered server',
    fn(t, args) {
      const host = args[0];
      if (!host) return t.println('connect to where?', 'err');
      const srv = game.server(host);
      if (!srv || !srv.discovered) return t.println(`unknown host: ${host}`, 'err');
      t.host = host;
      t.updatePrompt();
      t.println(`connected to ${host}. ${SERVER_DEFS[host].desc}`, 'dim');
    },
  },

  home: {
    usage: 'home',
    desc: 'jump back to your rig',
    fn(t) { t.host = 'home'; t.updatePrompt(); t.println('home again.', 'dim'); },
  },

  analyze: {
    usage: 'analyze',
    desc: 'inspect the connected server',
    fn(t) {
      const host = t.host;
      const srv = game.server(host);
      const def = SERVER_DEFS[host];
      const lvl = game.level();
      t.println(`${host} — ${def.desc}`, 'head');
      t.println(`  root access:   ${srv.rooted ? 'YES' : 'no'}`);
      t.println(`  locks (ports): ${def.ports} | skill required: ${def.reqLevel}`);
      t.println(`  credits:       ${fmtMoney(srv.money)} / ${fmtMoney(def.maxMoney)}`);
      t.println(`  security:      ${srv.sec.toFixed(2)} (floor ${def.minSec})`);
      t.println(`  RAM:           ${fmtRam(procs.ramUsed(host))} used of ${fmtRam(procs.ramTotal(host))}`);
      if (def.maxMoney > 0 && srv.rooted && lvl >= def.reqLevel) {
        t.println(`  hack:          ~${fmtTime(hackTime(srv, def, lvl))}, ${(hackChance(srv, def, lvl) * 100).toFixed(0)}% odds`);
        t.println(`  grow/weaken:   ~${fmtTime(growTime(srv, def, lvl))} / ~${fmtTime(weakenTime(srv, def, lvl))}`);
      }
    },
  },

  nuke: {
    usage: 'nuke',
    desc: 'force root on the connected server',
    fn(t) {
      const r = game.nuke(t.host);
      if (!r.ok) return t.println(r.error, 'err');
      t.println(`${t.host}: locks sheared. You have root.`, 'good');
      if (t.host === 'EIDOLON') t.println('…something old just noticed you.', 'warn');
    },
  },

  run: {
    usage: 'run <file.py> [args…]',
    desc: 'run a script here (RAM permitting)',
    fn(t, args) {
      const [script, ...rest] = args;
      if (!script) return t.println('run what?', 'err');
      const r = procs.spawn(script, t.host, rest);
      if (!r.ok) return t.println(r.error, 'err');
      t.println(`${script} running on ${t.host} (pid ${r.pid}, ${fmtRam(r.ram)}). \`tail ${r.pid}\` to watch it.`, 'good');
    },
  },

  ps: {
    usage: 'ps',
    desc: 'list running scripts',
    fn(t) {
      const list = procs.list();
      if (!list.length) return t.println('nothing running.', 'dim');
      t.println('  PID  STATUS  RAM     HOST          SCRIPT', 'head');
      for (const p of list) {
        t.println(`  ${String(p.pid).padEnd(4)} ${p.status.padEnd(7)} ${fmtRam(p.ram).padEnd(7)} ${p.host.padEnd(13)} ${p.script} ${p.args.join(' ')}`);
      }
    },
  },

  kill: {
    usage: 'kill <pid>|all',
    desc: 'stop a running script',
    fn(t, args) {
      if (args[0] === 'all') {
        procs.killAll();
        return t.println('all scripts stopped.', 'warn');
      }
      const pid = Number(args[0]);
      if (!Number.isInteger(pid)) return t.println('kill needs a pid (see `ps`)', 'err');
      const died = procs.kill(pid);
      t.println(died ? `pid ${pid} stopped.` : `no such pid: ${pid}`, died ? 'warn' : 'err');
    },
  },

  tail: {
    usage: 'tail <pid>',
    desc: 'show a script\'s recent log',
    fn(t, args) {
      const pid = Number(args[0]);
      const proc = procs.get(pid) ?? [...procs.history].reverse().find(p => p.pid === pid);
      if (!proc) return t.println(`no such pid: ${args[0]} (see \`ps\`; recent logs also live in the Scripts tab)`, 'err');
      for (const entry of proc.log.slice(-15)) {
        t.println(`  ${entry.text}`, entry.isError ? 'err' : '');
      }
      if (!proc.log.length) t.println('  (no output yet)', 'dim');
    },
  },

  ls: {
    usage: 'ls',
    desc: 'list your script files',
    fn(t) {
      const files = Object.keys(game.s.files).sort();
      if (!files.length) return t.println('no files. try `edit something.py`.', 'dim');
      for (const f of files) {
        t.println(`  ${f.padEnd(24)} ${fmtRam(scriptRamCost(game.s.files[f]))}`);
      }
      t.println('files live on your rig; RAM is spent wherever a script runs.', 'dim');
    },
  },

  cat: {
    usage: 'cat <file>',
    desc: 'print a file',
    fn(t, args) {
      const body = game.s.files[args[0]];
      if (body === undefined) return t.println(`no such file: ${args[0]}`, 'err');
      for (const line of body.split('\n')) t.println(line);
    },
  },

  edit: {
    usage: 'edit <file.py>',
    desc: 'open a file in the editor (creates it if new)',
    fn(t, args) {
      const name = args[0];
      if (!name) return t.println('edit what?', 'err');
      if (!/^[\w.-]+\.py$/.test(name)) return t.println('file names look like: my_script.py', 'err');
      if (game.s.files[name] === undefined) {
        game.writeFile(name, `# ${name}\nimport net\n\n`);
        t.println(`created ${name}.`, 'good');
      }
      t.ctx.openEditor(name);
    },
  },

  rm: {
    usage: 'rm <file>',
    desc: 'delete a file',
    fn(t, args) {
      if (game.s.files[args[0]] === undefined) return t.println(`no such file: ${args[0]}`, 'err');
      game.deleteFile(args[0]);
      t.println(`${args[0]} deleted.`, 'warn');
    },
  },

  cp: {
    usage: 'cp <src> <dst>',
    desc: 'copy a file',
    fn(t, args) {
      const [src, dst] = args;
      if (game.s.files[src] === undefined) return t.println(`no such file: ${src}`, 'err');
      if (!dst || !/^[\w.-]+\.py$/.test(dst)) return t.println('destination should end in .py', 'err');
      game.writeFile(dst, game.s.files[src]);
      t.println(`${src} → ${dst}`, 'good');
    },
  },

  market: {
    usage: 'market',
    desc: 'browse the salvage market',
    fn(t) {
      t.println('SALVAGE MARKET — everything here fell off the back of a dead corporation.', 'head');
      t.println('');
      t.println('crackers (open server locks; `buy <name>`):', 'head');
      for (const c of CRACKERS) {
        const owned = game.s.crackers.includes(c.id);
        t.println(`  ${c.file.padEnd(16)} ${owned ? '[owned]'.padEnd(10) : fmtMoney(c.price).padEnd(10)} ${c.desc}`);
      }
      t.println('');
      const ram = game.s.homeRam;
      if (ram < HOME_RAM_MAX) {
        t.println(`rig RAM: ${fmtRam(ram)} → ${fmtRam(ram * 2)} for ${fmtMoney(homeRamUpgradeCost(ram))}  (\`upgrade ram\`)`, 'head');
      } else {
        t.println(`rig RAM: ${fmtRam(ram)} (maxed)`, 'head');
      }
      t.println('');
      const n = game.s.drones.length;
      t.println(`siphon drones: ${n}/${DRONE_MAX} — passive credit reclaim (\`drone buy\`, \`drone up <n>\`, \`drones\`)`, 'head');
      if (n < DRONE_MAX) t.println(`  next drone: ${fmtMoney(droneBuyCost(n))}`);
    },
  },

  buy: {
    usage: 'buy <cracker>',
    desc: 'buy a cracker from the market',
    fn(t, args) {
      const name = (args[0] ?? '').replace(/\.py$/, '');
      const c = CRACKERS.find(x => x.id === name);
      if (!c) return t.println(`the market doesn't carry "${args[0]}". \`market\` to browse.`, 'err');
      if (game.s.crackers.includes(c.id)) return t.println(`you already own ${c.file}.`, 'warn');
      if (!game.trySpend(c.price)) return t.println(`${c.file} costs ${fmtMoney(c.price)}; you have ${fmtMoney(game.s.money)}.`, 'err');
      game.s.crackers.push(c.id);
      game.emit('milestone');
      t.println(`${c.file} acquired. You now hold ${game.s.crackers.length} cracker(s).`, 'good');
    },
  },

  upgrade: {
    usage: 'upgrade ram',
    desc: 'double your rig\'s RAM',
    fn(t, args) {
      if (args[0] !== 'ram') return t.println('only `upgrade ram` for now.', 'err');
      const ram = game.s.homeRam;
      if (ram >= HOME_RAM_MAX) return t.println('your rig is maxed out.', 'warn');
      const cost = homeRamUpgradeCost(ram);
      if (!game.trySpend(cost)) return t.println(`needs ${fmtMoney(cost)}; you have ${fmtMoney(game.s.money)}.`, 'err');
      game.s.homeRam = ram * 2;
      game.emit('servers');
      t.println(`rig RAM: ${fmtRam(ram)} → ${fmtRam(game.s.homeRam)}.`, 'good');
    },
  },

  drones: {
    usage: 'drones',
    desc: 'list your siphon drones',
    fn(t) {
      if (!game.s.drones.length) return t.println('no drones yet. `drone buy` when you have the credits.', 'dim');
      game.s.drones.forEach((d, i) => {
        t.println(`  drone ${i}: level ${d.level}, ${fmtMoney(droneIncome(d.level))}/s — upgrade: ${fmtMoney(droneUpgradeCost(d.level))} (\`drone up ${i}\`)`);
      });
      t.println(`fleet total: ${fmtMoney(game.dronesIncomePerSec())}/s`, 'head');
    },
  },

  drone: {
    usage: 'drone buy | drone up <n>',
    desc: 'buy or upgrade a siphon drone',
    fn(t, args) {
      if (args[0] === 'buy') {
        const n = game.s.drones.length;
        if (n >= DRONE_MAX) return t.println('your airspace is full.', 'warn');
        const cost = droneBuyCost(n);
        if (!game.trySpend(cost)) return t.println(`a drone costs ${fmtMoney(cost)}; you have ${fmtMoney(game.s.money)}.`, 'err');
        game.s.drones.push({ level: 1 });
        game.emit('milestone');
        t.println(`drone ${n} aloft. It reclaims ${fmtMoney(droneIncome(1))}/s from dead ad exchanges.`, 'good');
        return;
      }
      if (args[0] === 'up') {
        const i = Number(args[1]);
        const d = game.s.drones[i];
        if (!d) return t.println(`no drone ${args[1]}. \`drones\` to list.`, 'err');
        const cost = droneUpgradeCost(d.level);
        if (!game.trySpend(cost)) return t.println(`upgrade costs ${fmtMoney(cost)}; you have ${fmtMoney(game.s.money)}.`, 'err');
        d.level += 1;
        t.println(`drone ${i} → level ${d.level} (${fmtMoney(droneIncome(d.level))}/s).`, 'good');
        return;
      }
      t.println('usage: drone buy | drone up <n>', 'err');
    },
  },

  stats: {
    usage: 'stats',
    desc: 'your reclaimer record',
    fn(t) {
      const s = game.s.stats;
      const info = game.levelInfo();
      t.println(`skill ${info.level} (${Math.floor(info.into)}/${info.next} xp) — ${fmtMoney(game.s.money)}`, 'head');
      t.println(`  hacks: ${s.hacksSucceeded} good, ${s.hacksFailed} traced | grows: ${s.grows} | weakens: ${s.weakens}`);
      t.println(`  lifetime take: ${fmtMoney(s.moneyEarned)} | scripts finished: ${s.scriptsCompleted}`);
      t.println(`  servers rooted: ${game.rootedHosts().length}/${Object.keys(SERVER_DEFS).length} | crackers: ${game.s.crackers.length}/5`);
    },
  },

  money: { usage: 'money', desc: 'check your balance', fn(t) { t.println(fmtMoney(game.s.money), 'head'); } },
  servers: {
    usage: 'servers',
    desc: 'every host you\'ve discovered',
    fn(t) {
      for (const h of game.discoveredHosts()) {
        const srv = game.server(h);
        t.println(`  ${h.padEnd(14)} ${srv.rooted ? '[ROOT]' : '      '} ${SERVER_DEFS[h].maxMoney ? fmtMoney(srv.money) : ''}`);
      }
      t.println('the Network tab has the full picture.', 'dim');
    },
  },

  lessons: { usage: 'lessons', desc: 'open the lessons tab', fn(t) { t.ctx.showTab('lessons'); } },
  docs: { usage: 'docs', desc: 'open the net API reference', fn(t) { t.ctx.showTab('docs'); } },
  menu: { usage: 'menu', desc: 'return to the title screen', fn(t) { t.ctx.openMenu(); } },
  clear: { usage: 'clear', desc: 'wipe the terminal', fn(t) { t.out.innerHTML = ''; } },
  save: { usage: 'save', desc: 'save now (also autosaves)', fn(t) { game.save(); t.println('saved.', 'good'); } },

  about: {
    usage: 'about',
    desc: 'what is this place?',
    fn(t) {
      t.println('NETFALL', 'head');
      t.println('Twelve years ago the market-making AI EIDOLON ate the global net and choked on it.');
      t.println('The Fall killed the companies but not their machines. The old infrastructure still');
      t.println('hums, ownerless, running on momentum and maintenance contracts no one will ever cancel.');
      t.println('');
      t.println('You are a reclaimer: part archaeologist, part burglar. Your terminal speaks Python,');
      t.println('the last language the old world\'s machines still answer to. Every credit you siphon');
      t.println('was already lost. Every server you root was already abandoned. Probably.');
    },
  },

  reset: {
    usage: 'reset confirm',
    desc: 'wipe your save and start over',
    fn(t, args) {
      if (args[0] !== 'confirm') return t.println('this wipes everything. type `reset confirm` if you mean it.', 'warn');
      procs.killAll();
      game.reset();
      t.host = 'home';
      t.updatePrompt();
      t.println('the grid forgets you. fresh start.', 'warn');
    },
  },
};
