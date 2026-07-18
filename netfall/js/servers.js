// NETFALL — server network definitions and core game formulas.
// All tuning knobs live in this file. Times are real seconds, money in credits.

export const CRACKERS = [
  { id: 'picklock',    file: 'picklock.py',    price: 5_000,     desc: 'Rakes stale SSH handshakes until one gives. Opens port 22-class locks.' },
  { id: 'wormcast',    file: 'wormcast.py',    price: 30_000,    desc: 'Rides dead mailing lists into the relay. Opens mail-relay locks.' },
  { id: 'mirrorkey',   file: 'mirrorkey.py',   price: 180_000,   desc: 'Replays certificates the old world never revoked. Opens TLS-era locks.' },
  { id: 'hollowpoint', file: 'hollowpoint.py', price: 900_000,   desc: 'Punches through kernel debug ports left open by panicked admins. Opens core locks.' },
  { id: 'nullsong',    file: 'nullsong.py',    price: 4_000_000, desc: 'Sings the null-auth handshake EIDOLON used on its own children. Opens anything left.' },
];

// Static server definitions. Dynamic state (money, security, rooted, discovered)
// lives in the save; these are the immutable bones of the network.
export const SERVER_DEFS = {
  'home': {
    reqLevel: 0, ports: 0, maxMoney: 0, minSec: 1, startSec: 1, grow: 0,
    baseTime: 1, ram: 8, neighbors: ['dustbox', 'vendnet'],
    desc: 'Your rig. A salvaged rack in a dry basement, running the last Python interpreter you trust.',
  },
  'dustbox': {
    reqLevel: 1, ports: 0, maxMoney: 25_000, minSec: 1, startSec: 2, grow: 0.9,
    baseTime: 4, ram: 4, neighbors: ['home', 'koipond'],
    desc: 'A city parking-kiosk network still billing cars that rusted away years ago.',
  },
  'vendnet': {
    reqLevel: 1, ports: 0, maxMoney: 40_000, minSec: 1, startSec: 3, grow: 0.8,
    baseTime: 5, ram: 4, neighbors: ['home', 'night-owl', 'larder'],
    desc: 'Ten thousand vending machines, restocked by no one, still taking payment.',
  },
  'koipond': {
    reqLevel: 8, ports: 0, maxMoney: 90_000, minSec: 2, startSec: 4, grow: 0.7,
    baseTime: 7, ram: 8, neighbors: ['dustbox', 'copperline'],
    desc: 'A smart-garden controller for a corporate atrium. The koi are fine. The budget is unguarded.',
  },
  'night-owl': {
    reqLevel: 14, ports: 1, maxMoney: 200_000, minSec: 3, startSec: 5, grow: 0.65,
    baseTime: 9, ram: 8, neighbors: ['vendnet', 'glasswing'],
    desc: 'A 24-hour diner chain\'s point-of-sale mesh. Still open. Nobody knows who gets paid.',
  },
  'larder': {
    reqLevel: 20, ports: 1, maxMoney: 450_000, minSec: 4, startSec: 7, grow: 0.6,
    baseTime: 11, ram: 8, neighbors: ['vendnet', 'pale-echo'],
    desc: 'A food-logistics depot AI, dutifully rerouting freight for cities that stopped answering.',
  },
  'copperline': {
    reqLevel: 35, ports: 2, maxMoney: 1_200_000, minSec: 6, startSec: 10, grow: 0.55,
    baseTime: 14, ram: 16, neighbors: ['koipond', 'stackworks'],
    desc: 'The metro transit backbone. Trains run empty, on time, and flush with fare credit.',
  },
  'glasswing': {
    reqLevel: 50, ports: 2, maxMoney: 2_800_000, minSec: 8, startSec: 12, grow: 0.5,
    baseTime: 17, ram: 16, neighbors: ['night-owl', 'mirrorbank'],
    desc: 'A courier-drone fleet controller. The drones deliver parcels between warehouses, forever.',
  },
  'pale-echo': {
    reqLevel: 70, ports: 2, maxMoney: 5_000_000, minSec: 10, startSec: 15, grow: 0.5,
    baseTime: 20, ram: 32, neighbors: ['larder', 'cold-archive'],
    desc: 'A dead social network\'s ad exchange, trading impressions no one will ever see.',
  },
  'stackworks': {
    reqLevel: 95, ports: 3, maxMoney: 12_000_000, minSec: 12, startSec: 18, grow: 0.45,
    baseTime: 24, ram: 32, neighbors: ['copperline', 'the-spindle'],
    desc: 'An industrial fabricator hive. It prints parts for machines that print parts.',
  },
  'mirrorbank': {
    reqLevel: 130, ports: 3, maxMoney: 30_000_000, minSec: 15, startSec: 22, grow: 0.4,
    baseTime: 28, ram: 32, neighbors: ['glasswing', 'the-spindle'],
    desc: 'A regional bank\'s disaster-recovery mirror. The disaster came; the mirror never noticed.',
  },
  'cold-archive': {
    reqLevel: 170, ports: 4, maxMoney: 70_000_000, minSec: 18, startSec: 26, grow: 0.35,
    baseTime: 33, ram: 64, neighbors: ['pale-echo', 'ivory-gate'],
    desc: 'Subzero storage vaults holding the old world\'s secrets at four degrees Kelvin above bankruptcy.',
  },
  'the-spindle': {
    reqLevel: 220, ports: 4, maxMoney: 160_000_000, minSec: 22, startSec: 30, grow: 0.3,
    baseTime: 38, ram: 64, neighbors: ['stackworks', 'mirrorbank', 'ivory-gate'],
    desc: 'The orbital uplink array. Half the sky\'s satellites still phone home to this tower.',
  },
  'ivory-gate': {
    reqLevel: 280, ports: 5, maxMoney: 400_000_000, minSec: 26, startSec: 35, grow: 0.25,
    baseTime: 44, ram: 128, neighbors: ['cold-archive', 'the-spindle', 'EIDOLON'],
    desc: 'The last corporate citadel\'s perimeter. Its board of directors is an empty room with the lights on.',
  },
  'EIDOLON': {
    reqLevel: 350, ports: 5, maxMoney: 0, minSec: 50, startSec: 99, grow: 0,
    baseTime: 60, ram: 0, neighbors: ['ivory-gate'],
    desc: 'The market-making intelligence that ate the net and choked on it. It is still down there. It is still listening.',
  },
};

export const HOSTNAMES = Object.keys(SERVER_DEFS);

// ---------------------------------------------------------------------------
// Formulas. `srv` is dynamic state {money, sec}, `def` is the static def,
// `level` is the player's skill level.
// ---------------------------------------------------------------------------

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function secPenalty(srv, def) {
  return 1 + (srv.sec - def.minSec) * 0.06;
}

export function hackChance(srv, def, level) {
  const effReq = def.reqLevel * secPenalty(srv, def);
  return clamp(1.4 * level / (level + effReq), 0.05, 0.95);
}

export function stealFraction(srv, def, level) {
  const effReq = def.reqLevel * secPenalty(srv, def);
  return clamp(0.12 + 0.25 * level / (level + 3 * effReq), 0.12, 0.35);
}

export function hackTime(srv, def, level) {
  const secFactor = 1 + (srv.sec - def.minSec) * 0.04;
  const skillFactor = 0.5 + def.reqLevel / (def.reqLevel + Math.max(level, 1));
  return def.baseTime * secFactor * skillFactor;
}

export function growTime(srv, def, level) { return 2.4 * hackTime(srv, def, level); }
export function weakenTime(srv, def, level) { return 3.0 * hackTime(srv, def, level); }

// Applied at op completion. Each returns a summary the caller can report.
export function applyHack(srv, def, level, rng = Math.random) {
  const chance = hackChance(srv, def, level);
  if (rng() < chance) {
    const stolen = Math.floor(srv.money * stealFraction(srv, def, level));
    srv.money = Math.max(0, srv.money - stolen);
    srv.sec = srv.sec + 0.6;
    return { success: true, amount: stolen, xp: 3 + def.reqLevel * 0.7 };
  }
  srv.sec = srv.sec + 0.2;
  return { success: false, amount: 0, xp: 1 + def.reqLevel * 0.1 };
}

export function applyGrow(srv, def, level) {
  const factor = 1 + (def.grow * 0.5) / secPenalty(srv, def);
  srv.money = Math.min(def.maxMoney, Math.floor((srv.money + 100) * factor));
  srv.sec = srv.sec + 0.3;
  return { money: srv.money, xp: 2 + def.reqLevel * 0.4 };
}

export function applyWeaken(srv, def, level) {
  srv.sec = Math.max(def.minSec, srv.sec - 1.5);
  return { sec: srv.sec, xp: 2 + def.reqLevel * 0.4 };
}

// ---------------------------------------------------------------------------
// Player progression
// ---------------------------------------------------------------------------

// XP needed to go from level n to n+1.
export function xpToNext(n) {
  return Math.floor(15 + 9 * Math.pow(n, 1.5));
}

export function levelFromXp(totalXp) {
  let level = 1, spent = 0;
  while (totalXp - spent >= xpToNext(level)) {
    spent += xpToNext(level);
    level += 1;
  }
  return { level, into: totalXp - spent, next: xpToNext(level) };
}

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

export const HOME_RAM_BASE = 8;
export const HOME_RAM_MAX = 2048;
export function homeRamUpgradeCost(currentRam) {
  const upgrades = Math.log2(currentRam / HOME_RAM_BASE);
  return Math.floor(1800 * Math.pow(2.6, upgrades));
}

export function droneBuyCost(count) {
  return Math.floor(400 * Math.pow(1.75, count));
}
export function droneUpgradeCost(level) {
  return Math.floor(250 * Math.pow(1.7, level));
}
export function droneIncome(level) {
  return 1.2 * Math.pow(level, 1.15); // credits per second
}
export const DRONE_MAX = 12;

// RAM cost, in GB, of each net.* API function appearing in a script.
export const API_RAM = {
  hack: 0.15, grow: 0.15, weaken: 0.15, nuke: 0.05,
  scan: 0.25, server: 0.05, servers: 0.3,
  money: 0.02, skill: 0.02, sleep: 0, log: 0, hostname: 0,
  run: 1.0, ps: 0.3, kill: 0.3, has_root: 0.05,
  hack_time: 0.05, grow_time: 0.05, weaken_time: 0.05,
};
export const SCRIPT_RAM_BASE = 1.0;

export function scriptRamCost(code) {
  const seen = new Set();
  for (const m of code.matchAll(/\bnet\s*\.\s*([a-zA-Z_]\w*)/g)) {
    if (m[1] in API_RAM) seen.add(m[1]);
  }
  let cost = SCRIPT_RAM_BASE;
  for (const fn of seen) cost += API_RAM[fn];
  return Math.round(cost * 100) / 100;
}

export const MAX_PROCS = 8; // each script is a full Python interpreter; be kind to RAM
