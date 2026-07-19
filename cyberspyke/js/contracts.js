// CYBERSPYKE — coding contracts: standalone Python puzzles that surface on
// servers and pay credits. Each type generates a problem instance, describes
// it, and verifies an answer. The answer is never stored in the data sent to
// the player — it's recomputed at verify time — so the puzzle can't be cheated
// by reading net.contract(host)["data"].

// -- tiny rng/helpers (game code may use Math.random) ----------------------
function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function choice(a) { return a[randInt(0, a.length - 1)]; }
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = randInt(0, i); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// Original, on-theme vocabulary for text puzzles.
const WORDS = ['grid', 'signal', 'ghost', 'relay', 'static', 'echo', 'vault', 'drone',
  'cipher', 'packet', 'node', 'trace', 'kiosk', 'freight', 'ember', 'hollow',
  'mirror', 'spindle', 'archive', 'beacon', 'lattice', 'harbor', 'cinder', 'quiet'];

function normNumber(v) {
  const n = Number(Array.isArray(v) && v.length === 1 ? v[0] : v);
  return Number.isFinite(n) ? n : null;
}
function normBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return null;
}
function isBalanced(s) {
  const open = { '(': ')', '[': ']', '{': '}' };
  const stack = [];
  for (const ch of s) {
    if (ch in open) stack.push(open[ch]);
    else if (ch === ')' || ch === ']' || ch === '}') { if (stack.pop() !== ch) return false; }
  }
  return stack.length === 0;
}
function genBalanced(pairs) {
  const opens = ['(', '[', '{'], close = { '(': ')', '[': ']', '{': '}' };
  let out = '', remaining = pairs; const stack = [];
  while (remaining > 0 || stack.length) {
    if (remaining > 0 && (!stack.length || Math.random() < 0.5)) {
      const o = choice(opens); stack.push(o); out += o; remaining--;
    } else out += close[stack.pop()];
  }
  return out;
}
function corruptBrackets(s) {
  const chars = '()[]{}';
  for (let attempt = 0; attempt < 8; attempt++) {
    const arr = s.split('');
    const i = randInt(0, arr.length - 1);
    if (Math.random() < 0.5) arr.splice(i, 1);
    else { let c; do { c = chars[randInt(0, 5)]; } while (c === arr[i]); arr[i] = c; }
    const t = arr.join('');
    if (t.length && !isBalanced(t)) return t;
  }
  return s + ')';
}
function caesar(text, shift) {
  return text.replace(/[a-z]/g, ch => String.fromCharCode((ch.charCodeAt(0) - 97 + shift) % 26 + 97));
}

// -- contract types --------------------------------------------------------
// tier: 1 beginner, 2 intermediate, 3 advanced.
export const CONTRACT_TYPES = {
  'sum-pair': {
    tier: 1, title: 'Twin Signals',
    generate() {
      const pool = [];
      while (pool.length < 7) { const n = randInt(2, 45); if (!pool.includes(n)) pool.push(n); }
      const i = randInt(0, pool.length - 1);
      let j = randInt(0, pool.length - 1); while (j === i) j = randInt(0, pool.length - 1);
      return { numbers: pool, target: pool[i] + pool[j] };
    },
    describe(d) {
      return `Two of these numbers add up to ${d.target}. Return the pair as a list, e.g. [3, 8].\n\n`
        + `numbers = ${JSON.stringify(d.numbers)}`;
    },
    verify(d, ans) {
      if (!Array.isArray(ans) || ans.length !== 2) return false;
      const a = Number(ans[0]), b = Number(ans[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (a + b !== d.target) return false;
      if (a === b) return d.numbers.filter(x => x === a).length >= 2;
      return d.numbers.includes(a) && d.numbers.includes(b);
    },
  },

  'count-vowels': {
    tier: 1, title: 'Vowel Census',
    generate() { return { text: Array.from({ length: randInt(3, 5) }, () => choice(WORDS)).join(' ') }; },
    describe(d) {
      return `Count the vowels (a, e, i, o, u) in this string. Return the number.\n\n`
        + `text = ${JSON.stringify(d.text)}`;
    },
    verify(d, ans) {
      const n = normNumber(ans);
      return n !== null && n === (d.text.match(/[aeiou]/gi) || []).length;
    },
  },

  'reverse-words': {
    tier: 1, title: 'Backtalk',
    generate() { return { sentence: Array.from({ length: randInt(4, 6) }, () => choice(WORDS)).join(' ') }; },
    describe(d) {
      return `Reverse the ORDER of the words (not the letters). Return the new string.\n\n`
        + `sentence = ${JSON.stringify(d.sentence)}`;
    },
    verify(d, ans) {
      return typeof ans === 'string' && ans.trim() === d.sentence.split(' ').reverse().join(' ');
    },
  },

  'divisible-count': {
    tier: 1, title: 'Sieve Count',
    generate() {
      const k = randInt(2, 9), lo = randInt(1, 20), hi = randInt(1, 20) + lo + 30;
      return { lo, hi, k };
    },
    describe(d) {
      return `How many integers from ${d.lo} to ${d.hi} (inclusive) are divisible by ${d.k}? Return the count.`;
    },
    verify(d, ans) {
      const n = normNumber(ans);
      if (n === null) return false;
      let c = 0; for (let x = d.lo; x <= d.hi; x++) if (x % d.k === 0) c++;
      return n === c;
    },
  },

  'word-frequency': {
    tier: 2, title: 'Loudest Voice',
    generate() {
      const distinct = shuffle(WORDS).slice(0, 4);
      const winCount = randInt(4, 6);
      const parts = [];
      for (let i = 0; i < winCount; i++) parts.push(distinct[0]);
      for (const w of distinct.slice(1)) { const c = randInt(1, winCount - 1); for (let i = 0; i < c; i++) parts.push(w); }
      return { text: shuffle(parts).join(' ') };
    },
    describe(d) {
      return `Which word appears most often? Return it as a string.\n\ntext = ${JSON.stringify(d.text)}`;
    },
    verify(d, ans) {
      if (typeof ans !== 'string') return false;
      const counts = {};
      for (const w of d.text.split(' ')) counts[w] = (counts[w] || 0) + 1;
      let best = null, bc = -1;
      for (const [w, c] of Object.entries(counts)) if (c > bc) { bc = c; best = w; }
      return ans.trim().toLowerCase() === best.toLowerCase();
    },
  },

  'caesar-decrypt': {
    tier: 2, title: 'Dead Drop',
    generate() {
      const plain = Array.from({ length: randInt(3, 5) }, () => choice(WORDS)).join(' ');
      const shift = randInt(1, 25);
      return { cipher: caesar(plain, shift), shift };
    },
    describe(d) {
      return `This message was Caesar-shifted FORWARD by ${d.shift}. Decrypt it (shift back) and `
        + `return the plaintext string.\n\ncipher = ${JSON.stringify(d.cipher)}`;
    },
    verify(d, ans) {
      if (typeof ans !== 'string') return false;
      return ans.trim().toLowerCase() === caesar(d.cipher, (26 - (d.shift % 26)) % 26);
    },
  },

  'balanced-brackets': {
    tier: 2, title: 'Nesting Check',
    generate() {
      let s = genBalanced(randInt(2, 5));
      if (Math.random() < 0.5) s = corruptBrackets(s);
      return { s };
    },
    describe(d) {
      return `Are these brackets balanced and correctly nested? Return True or False.\n\n`
        + `brackets = ${JSON.stringify(d.s)}`;
    },
    verify(d, ans) {
      const b = normBool(ans);
      return b !== null && b === isBalanced(d.s);
    },
  },

  'max-subarray': {
    tier: 3, title: 'Peak Draw',
    generate() { return { numbers: Array.from({ length: randInt(6, 9) }, () => randInt(-9, 9)) }; },
    describe(d) {
      return `Find the maximum sum of any contiguous, non-empty run of these numbers. Return the sum.\n\n`
        + `numbers = ${JSON.stringify(d.numbers)}`;
    },
    verify(d, ans) {
      const n = normNumber(ans);
      if (n === null) return false;
      let best = -Infinity, cur = 0;
      for (const x of d.numbers) { cur = Math.max(x, cur + x); best = Math.max(best, cur); }
      return n === best;
    },
  },
};

export const CONTRACT_TRIES = 5;

export function contractReward(tier, reqLevel) {
  const base = { 1: 9000, 2: 55000, 3: 300000 }[tier] || 9000;
  return Math.floor(base * (1 + reqLevel / 40));
}

export function pickTypeForLevel(reqLevel) {
  const tiers = reqLevel < 15 ? [1] : reqLevel < 80 ? [1, 2] : [2, 3];
  const pool = Object.keys(CONTRACT_TYPES).filter(id => tiers.includes(CONTRACT_TYPES[id].tier));
  return choice(pool);
}

export function makeContract(typeId, host, reqLevel) {
  const type = CONTRACT_TYPES[typeId];
  return { type: typeId, host, data: type.generate(), reward: contractReward(type.tier, reqLevel), tries: CONTRACT_TRIES };
}

export function contractTitle(c) { return CONTRACT_TYPES[c.type]?.title ?? 'Unknown Contract'; }
export function contractTier(c) { return CONTRACT_TYPES[c.type]?.tier ?? 1; }
export function describeContract(c) { return CONTRACT_TYPES[c.type]?.describe(c.data) ?? ''; }
export function verifyContract(c, answer) {
  const type = CONTRACT_TYPES[c.type];
  try { return !!type && type.verify(c.data, answer); } catch { return false; }
}
