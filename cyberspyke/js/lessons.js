// CYBERSPYKE — the lessons: a Python curriculum disguised as a tutorial.
// Each lesson has an in-fiction briefing, the Python concepts it teaches,
// optional starter code, and a completion check evaluated against game state.

import { game } from './state.js';
import { escapeHtml } from './util.js';

export const LESSONS = [
  {
    id: 'wake',
    title: '0 · Wake Up',
    concepts: 'the terminal',
    body: `Twelve years since the Fall, and your rig finally boots. Time to work.
Everything in CYBERSPYKE happens through two tools: the <b>Terminal</b> and the <b>Editor</b>.
Try this in the terminal, one line at a time:
<pre>scan
connect dustbox
analyze
nuke
home</pre>
<code>scan</code> shows what a server is wired to. <code>connect</code> hops to it. <code>nuke</code> shears
its locks and gives you <b>root</b> — permission to run code against it. The dustbox has
no locks at all; nobody guarded a parking kiosk even before the world ended.`,
    check: () => game.server('dustbox')?.rooted,
    done: 'You rooted the dustbox. It will bill ghost-cars for you now.',
  },
  {
    id: 'hello',
    title: '1 · Hello, Grid',
    concepts: 'print() · running scripts',
    starter: {
      name: 'hello.py',
      code: `# Your first script. print() writes to the script's log.
print("hello, grid")
print("this rig has seen better decades")
`,
    },
    body: `Scripts are Python files that live on your rig. Load the starter file, look at it
in the <b>Editor</b>, then run it from the terminal:
<pre>run hello.py</pre>
Every script costs <b>RAM</b> while it runs. Simple scripts are cheap; every grid function
you call adds to the bill. Watch a script's output with <code>tail &lt;pid&gt;</code> or in the
<b>Scripts</b> tab. <code>print()</code> is your flashlight down here — use it constantly.`,
    check: () => game.s.stats.scriptsCompleted >= 1,
    done: 'A script ran and exited clean. You are officially dangerous.',
  },
  {
    id: 'variables',
    title: '2 · Variables & the net Module',
    concepts: 'import · variables · f-strings',
    starter: {
      name: 'balance.py',
      code: `# The net module is your interface to the grid. Import it, ask it things.
import net

credits = net.money()
level = net.skill()

print(f"balance: {credits:.0f} credits")
print(f"skill:   level {level}")
print(f"rig:     {net.hostname()}")
`,
    },
    body: `The <code>net</code> module is how scripts talk to the grid — every reclaimer tool you'll
ever build starts with <code>import net</code>. Values you get back can be stored in
<b>variables</b> and formatted into <b>f-strings</b> (the <code>f"…{x}…"</code> syntax).
Run the starter, then edit it: print your balance doubled. Math on variables is free;
math on credits, less so.`,
    check: () => game.s.stats.apiMoneyChecks >= 1 && game.s.stats.scriptsCompleted >= 1,
    done: 'You read the grid from code. The terminal is optional now.',
  },
  {
    id: 'heist',
    title: '3 · The First Siphon',
    concepts: 'function calls · return values',
    starter: {
      name: 'siphon.py',
      code: `# net.hack() siphons credits from a rooted server.
# It BLOCKS — the script genuinely waits while the job runs. That's normal.
import net

took = net.hack("dustbox")
print(f"took {took:.0f} credits")
`,
    },
    body: `<code>net.hack(host)</code> is the whole trade in one call: it works the target for a few
seconds, then either siphons a cut of its credits or gets traced and takes nothing.
It <b>returns</b> the amount stolen — capture it in a variable. A failed attempt returns 0;
that's not an error, just a bad night. You need root on the target and enough skill
(the dustbox wants skill 1 — you qualify).`,
    check: () => game.s.stats.hacksSucceeded >= 1,
    done: 'First blood. The credits were already lost — you just found them.',
  },
  {
    id: 'loops',
    title: '4 · The Harvest Loop',
    concepts: 'while · if/elif/else · comparisons',
    starter: {
      name: 'harvest.py',
      code: `# The classic reclaimer loop: keep the target soft, full, and bleeding.
import net

target = "dustbox"

while True:
    info = net.server(target)
    if info["security"] > info["min_security"] + 3:
        print("security high -> weaken")
        net.weaken(target)
    elif info["money"] < info["max_money"] * 0.5:
        print("money low -> grow")
        net.grow(target)
    else:
        took = net.hack(target)
        print(f"hacked for {took:.0f}")
`,
    },
    body: `Hacking raises a server's <b>security</b> (slower, riskier ops) and drains its credits.
<code>net.weaken()</code> scrubs security down; <code>net.grow()</code> fluffs the balance back up.
The loop above decides which tool the moment needs — that's a <b>while loop</b> wrapped
around an <b>if/elif/else</b>. Run it and let it work (<code>kill</code> stops it when you're done).
This one script, pointed at a good target, is your first real income.`,
    check: () => game.s.stats.totalOps >= 15 && game.s.stats.weakens >= 1 && game.s.stats.grows >= 1,
    done: 'Weaken, grow, hack — the harvest rhythm. Everything else is scale.',
  },
  {
    id: 'args',
    title: '5 · Arguments & Functions',
    concepts: 'net.args · def · defaults',
    starter: {
      name: 'harvest2.py',
      code: `# Same harvest loop, but the target comes in from the command line:
#   run harvest2.py vendnet
import net

def pick_tool(info):
    """Decide what this server needs right now."""
    if info["security"] > info["min_security"] + 3:
        return "weaken"
    if info["money"] < info["max_money"] * 0.5:
        return "grow"
    return "hack"

target = net.args[0] if net.args else "dustbox"
print(f"harvesting {target}")

while True:
    tool = pick_tool(net.server(target))
    if tool == "weaken":
        net.weaken(target)
    elif tool == "grow":
        net.grow(target)
    else:
        net.hack(target)
`,
    },
    body: `A script that only ever robs the dustbox is a toy. <code>net.args</code> is the list of
arguments you pass after the script name — <code>run harvest2.py vendnet</code> puts
<code>"vendnet"</code> in <code>net.args[0]</code>. The decision logic moved into a
<b>function</b> (<code>def</code>) with a docstring, so the loop reads like a sentence.
One script, any target. That's the point of functions.`,
    check: () => game.s.stats.scriptsWithArgs >= 1,
    done: 'Parameterized. Write once, aim anywhere.',
  },
  {
    id: 'maps',
    title: '6 · Walking the Wires',
    concepts: 'lists · for loops · dicts',
    starter: {
      name: 'survey.py',
      code: `# Survey everything wired to your rig, then everything one hop out.
import net

seen = []
for host in net.scan("home"):
    seen.append(host)
    for far in net.scan(host):
        if far not in seen and far != "home":
            seen.append(far)

print(f"{len(seen)} hosts in reach:")
for host in seen:
    info = net.server(host)
    tag = "ROOT" if info["rooted"] else f"{info['ports_required']} locks"
    print(f"  {host:<14} [{tag}] skill {info['level_required']}")
`,
    },
    body: `<code>net.scan(host)</code> returns a <b>list</b> of hostnames wired to a server, and a
<b>for loop</b> walks it. <code>net.server(host)</code> returns a <b>dict</b> — a bundle of
labeled facts you index by name, like <code>info["money"]</code>. The starter walks two
hops out from home and prints a survey. The deep network is out there past what
you've scanned; every new hop is a bigger paycheck than the last.`,
    check: () => game.s.stats.apiScans >= 3,
    done: 'You can see the wires now. The map is code.',
  },
  {
    id: 'crawler',
    title: '7 · The Crawler',
    concepts: 'recursion · sets · deploying code',
    starter: {
      name: 'crawler.py',
      code: `# Crawl the whole reachable grid: root what you can, deploy harvesters
# everywhere they'll fit. This is the reclaimer's master key.
import net

visited = set()

def crawl(host):
    if host in visited:
        return
    visited.add(host)

    info = net.server(host)
    if not info["rooted"]:
        if net.skill() >= info["level_required"]:
            try:
                net.nuke(host)
                print(f"rooted {host}")
            except net.NetError as e:
                print(f"{host}: {e}")

    info = net.server(host)
    if info["rooted"] and host != "home" and info["ram"] >= 2:
        pid = net.run("harvest2.py", host, host)
        if pid:
            print(f"deployed harvester on {host} (pid {pid})")

    for neighbor in net.scan(host):
        crawl(neighbor)

crawl("home")
print(f"crawl complete: {len(visited)} hosts visited")
`,
    },
    body: `The survey script hard-coded two hops. <b>Recursion</b> removes the limit: <code>crawl()</code>
visits a host, then calls <i>itself</i> on every neighbor, with a <b>set</b> remembering where
it's been so the loop closes. Along the way it nukes what your crackers can open and
uses <code>net.run(script, host, arg)</code> to launch harvesters on other machines —
their RAM, your payroll. You'll need <code>harvest2.py</code> from lesson 5 on your rig.`,
    check: () => game.rootedHosts().length >= 5 && game.s.stats.remoteRuns >= 1,
    done: 'Self-spreading infrastructure. The old net works for you now.',
  },
  {
    id: 'empire',
    title: '8 · The Long Game',
    concepts: 'strategy · the deep grid',
    body: `No starter file this time — you have all the tools. What's left is scale:
<ul>
<li><b>Crackers</b> from the <code>market</code> open deeper servers: five locks guard the richest.</li>
<li><b>Rig RAM</b> (<code>upgrade ram</code>) means more scripts at once.</li>
<li><b>Siphon drones</b> (<code>drone buy</code>) reclaim credits even while you're away.</li>
<li>Deeper servers pay orders of magnitude more — <code>the-spindle</code> holds 160 million.</li>
</ul>
And at the bottom of the network, past ivory-gate, something is still down there.
The thing that caused the Fall. Rooting it would take skill 350 and every cracker
ever made. No reclaimer has done it. Most won't say its name.`,
    check: () => game.s.drones.length >= 1 && game.s.crackers.length >= 2,
    done: 'Empire hours. See you at the bottom of the grid.',
  },
];

export class Lessons {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { toast, openEditor }
    game.on('milestone', () => this.evaluate());
    game.on('reset', () => this.render());
    this.render();
  }

  evaluate() {
    let changed = false;
    for (const lesson of LESSONS) {
      if (!game.s.lessonsDone[lesson.id] && lesson.check()) {
        game.s.lessonsDone[lesson.id] = true;
        changed = true;
        this.ctx.toast(`lesson complete: ${lesson.title}`, 'good');
      }
    }
    if (changed) this.render();
  }

  render() {
    this.root.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'lessons-head';
    const doneCount = LESSONS.filter(l => game.s.lessonsDone[l.id]).length;
    head.innerHTML = `<h2>Field Training</h2>
      <p class="dim">Python, taught the way the old world left it: by necessity. ${doneCount}/${LESSONS.length} complete.</p>`;
    this.root.appendChild(head);

    LESSONS.forEach((lesson, i) => {
      const done = !!game.s.lessonsDone[lesson.id];
      const prevDone = i === 0 || !!game.s.lessonsDone[LESSONS[i - 1].id];
      const det = document.createElement('details');
      det.className = 'lesson' + (done ? ' done' : '') + (!prevDone ? ' locked' : '');
      if (!done && prevDone) det.open = true;

      const summary = document.createElement('summary');
      summary.innerHTML = `<span class="lesson-mark">${done ? '✔' : prevDone ? '▸' : '·'}</span>
        <span class="lesson-title">${escapeHtml(lesson.title)}</span>
        <span class="lesson-concepts">${escapeHtml(lesson.concepts)}</span>`;
      det.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'lesson-body';
      body.innerHTML = lesson.body;
      if (lesson.starter) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-accent';
        btn.textContent = `load starter: ${lesson.starter.name}`;
        btn.addEventListener('click', () => {
          if (game.s.files[lesson.starter.name] === undefined) {
            game.writeFile(lesson.starter.name, lesson.starter.code);
            this.ctx.toast(`${lesson.starter.name} written to your rig`, 'good');
          }
          this.ctx.openEditor(lesson.starter.name);
        });
        body.appendChild(btn);
      }
      if (done) {
        const p = document.createElement('p');
        p.className = 'lesson-done-note';
        p.textContent = lesson.done;
        body.appendChild(p);
      }
      det.appendChild(body);
      this.root.appendChild(det);
    });
  }
}
