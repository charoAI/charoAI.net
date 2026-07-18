# NETFALL

*Learn Python by looting the dead internet.*

A browser-based hacking incremental game in the spirit of
[Bitburner](https://github.com/bitburner-official/bitburner-src)'s mechanics — except every
script the player writes is **real Python**, executed by a genuine CPython interpreter
([Pyodide](https://pyodide.org)) running in WebAssembly. The game doubles as a Python
curriculum: progression is gated along the language's learning curve, from `print()` to
recursion.

**Play:** open `index.html` from any static host (it's live wherever this repo's GitHub Pages
serves it, at `/netfall/`). No build step, no server, no accounts. Saves live in
localStorage.

## Premise

Twelve years ago the market-making AI **EIDOLON** ate the global net and choked on it. The
Fall killed the companies but not their machines: vending networks still bill ghosts, empty
trains run on time, bank mirrors wait for a disaster that already came. You are a
**reclaimer** — part archaeologist, part burglar — siphoning credits from derelict servers
with the last language the old machines still answer to: Python.

(All lore, names, and text are original; only the mechanical skeleton — hack/grow/weaken,
RAM-costed scripts, port crackers — is inspired by Bitburner, whose source is Apache-2.0.)

## Architecture

Static ES modules, zero build step, zero external dependencies at runtime (Pyodide is
vendored):

```
index.html            shell + docs + COI service-worker bootstrap
coi-serviceworker.js  adds COOP/COEP headers on static hosts (GitHub Pages)
css/netfall.css       the whole look
js/
  servers.js          network definitions + every formula/tuning knob
  state.js            save file, event bus, persistence
  procs.js            process manager: spawns workers, serves the API bridge, applies game rules
  worker.js           per-script worker: boots Pyodide, runs player code
  terminal.js         shell commands
  editor.js           dependency-free Python-highlighting editor
  lessons.js          the curriculum
  ui.js               tabs, topbar, network/scripts panels
  main.js             boot wiring
py/net_api.py         the `net` module injected into every script
vendor/pyodide/       CPython-in-wasm runtime (Pyodide 0.27.5, MPL-2.0)
```

### The blocking bridge (the interesting part)

Beginners shouldn't need `async`/`await` on day one, so `net.hack()` *actually blocks*.
Each running script gets its own web worker with its own Python interpreter. An API call:

1. Worker posts `{fn, args}` to the main thread and parks the entire worker on
   `Atomics.wait` against a `SharedArrayBuffer`.
2. The main thread (the game engine) validates the call, waits out the operation's real
   duration, applies the game effects, writes the JSON response into the buffer, and
   `Atomics.notify`s.
3. The worker wakes, decodes, and returns the value to Python. Killing a script is just
   `worker.terminate()`.

`SharedArrayBuffer` requires cross-origin isolation; since GitHub Pages can't set response
headers, `coi-serviceworker.js` stamps COOP/COEP onto responses and the page reloads once to
pick them up. Everything is same-origin (Pyodide is vendored), which keeps that worker
trivial.

### Teaching design

- **Lessons 0–8** gate concepts in order: terminal → `print` → variables/f-strings →
  function calls/returns → `while`/`if` → args/`def` → lists/`for`/dicts → recursion/sets →
  strategy. Completion is detected from play stats, not quizzes.
- **RAM costs per API function** make code shape a mechanical concern, as in Bitburner.
- **Tracebacks are preserved**: crashed scripts stay visible in the Scripts tab with their
  Python error, trimmed to the player's own frames.
- Grid refusals are a catchable `net.NetError` — exception handling arrives naturally.

## Tuning

Every number that matters — server stats, hack/grow/weaken formulas, XP curve, prices —
lives in `js/servers.js` with the intent that it be tweaked.

## Roadmap (post-MVP candidates)

- Coding contracts (standalone Python puzzles for cash) — the natural next teaching device
- Script threads (`run -t 4`) and an income/sec dashboard
- Offline script simulation; import/export saves
- Factions, augment-style prestige, chapter two of the EIDOLON story
- An in-game hint system that reads the player's tracebacks

## Dev notes

Serve locally with COOP/COEP headers (avoids the service-worker reload):

```sh
python3 tools/serve.py   # http://localhost:8137/netfall/
```

E2E tests: `node tools/e2e.mjs` (Playwright + the pre-installed Chromium).
